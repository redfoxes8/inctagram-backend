import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { GraphQLSchemaHost } from '@nestjs/graphql';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import cookieParser from 'cookie-parser';
import { GraphQLError, subscribe, type ExecutionResult, type GraphQLFormattedError } from 'graphql';
import { GRAPHQL_TRANSPORT_WS_PROTOCOL, type Disposable } from 'graphql-ws';
import { useServer } from 'graphql-ws/use/ws';
import { WebSocket, WebSocketServer } from 'ws';
import { AdminPrincipalVerifier, type AdminPrincipal } from '../domain/admin-principal';
import type { SuperadminWsContext } from './superadmin-context';
import { SUPERADMIN_GRAPHQL_PATH } from './superadmin-http-security';
import { formatSuperadminError } from './superadmin-errors';
import { prepareSuperadminSubscription, superadminWsError } from './superadmin-ws-operation';
import { protectSuperadminIterator } from './protect-superadmin-iterator';

export const SUPERADMIN_SUBSCRIPTIONS = Symbol('SUPERADMIN_SUBSCRIPTIONS');
export type SuperadminSubscriptionOptions = Readonly<{
  allowedOrigins: string[];
  fields: string[];
  production: boolean;
}>;
export const SUPERADMIN_WS_LIMITS = Object.freeze({
  pingMs: 25000,
  pongMs: 10000,
  sweepMs: 30000,
  initMs: 5000,
  maxPayload: 65536,
  connections: 100,
  sessionConnections: 5,
});

type Connection = {
  socket: WebSocket;
  context: SuperadminWsContext;
  token: string | null;
  sessionId: string | null;
  operationId: string | null;
  closed: boolean;
  ping: ReturnType<typeof setInterval>;
  pongDeadline: ReturnType<typeof setTimeout> | null;
  nonce: string | null;
  cleanup: Set<() => void>;
};

@Injectable()
export class SuperadminSubscriptionServer implements OnApplicationBootstrap, OnModuleDestroy {
  private server: Server | null = null;
  private sockets: WebSocketServer | null = null;
  private disposable: Disposable | null = null;
  private sweep: ReturnType<typeof setInterval> | null = null;
  private sweeping = false;
  private stopped = false;
  private readonly connections = new Map<WebSocket, Connection>();

  constructor(
    private readonly adapter: HttpAdapterHost,
    private readonly schemaHost: GraphQLSchemaHost,
    private readonly verifier: AdminPrincipalVerifier,
    @Inject(SUPERADMIN_SUBSCRIPTIONS) private readonly options: SuperadminSubscriptionOptions,
  ) {}

  onApplicationBootstrap(): void {
    const schema = this.schemaHost.schema;
    const root = schema.getSubscriptionType();
    if (
      !root ||
      !this.options.fields.length ||
      this.options.fields.some((field) => !root.getFields()[field])
    )
      throw new Error('Explicit subscription root and allowed fields required');
    this.server = this.adapter.httpAdapter.getHttpServer() as Server;
    this.sockets = new WebSocketServer({
      noServer: true,
      maxPayload: SUPERADMIN_WS_LIMITS.maxPayload,
      handleProtocols: (protocols) =>
        protocols.has(GRAPHQL_TRANSPORT_WS_PROTOCOL) ? GRAPHQL_TRANSPORT_WS_PROTOCOL : false,
    });
    this.sockets.on('connection', (socket, request) => this.register({ socket, request }));
    this.disposable = useServer(
      {
        schema,
        connectionInitWaitTimeout: SUPERADMIN_WS_LIMITS.initMs,
        onConnect: async ({ extra }): Promise<boolean> => {
          const connection = this.connections.get(extra.socket);
          if (!connection) return false;
          if (!this.options.allowedOrigins.includes(extra.request.headers.origin ?? '')) {
            this.close({ connection, code: 4403, reason: 'Forbidden' });
            return false;
          }
          try {
            await connection.context.lifecycle.assertAuthorized();
            return !connection.closed;
          } catch {
            return false;
          }
        },
        onSubscribe: async ({ extra }, id, payload) => {
          const connection = this.connections.get(extra.socket);
          if (!connection || connection.closed) return [superadminWsError('UNAUTHENTICATED')];
          if (connection.operationId !== null) return [superadminWsError('TOO_MANY_REQUESTS')];
          connection.operationId = id;
          try {
            await connection.context.lifecycle.assertAuthorized();
            return prepareSuperadminSubscription({
              schema,
              payload,
              context: connection.context,
              fields: this.options.fields,
              production: this.options.production,
            });
          } catch (error) {
            return [this.safeError(error)];
          }
        },
        subscribe: async (args) => {
          try {
            const result = await subscribe(args);
            return Symbol.asyncIterator in result
              ? protectSuperadminIterator({
                  source: result,
                  context: args.contextValue as SuperadminWsContext,
                })
              : result;
          } catch (error) {
            return { errors: [this.safeError(error)] };
          }
        },
        onNext: (_context, _id, _payload, _args, result) => this.safeResult(result),
        onError: ({ extra }, id, _payload, errors) => {
          this.complete({ socket: extra.socket, id });
          return errors.map((error) => this.safeError(error).toJSON());
        },
        onComplete: ({ extra }, id): void => this.complete({ socket: extra.socket, id }),
      },
      this.sockets,
      0,
    ); // Own exactly one protocol heartbeat; library's keepalive is disabled.
    this.server.on('upgrade', this.upgrade);
    this.sweep = setInterval(() => {
      void this.checkSessions();
    }, SUPERADMIN_WS_LIMITS.sweepMs);
    this.sweep.unref();
  }

  private readonly upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    // Do not consume, close, or handleUpgrade Socket.IO/other paths. Query-string credentials are forbidden.
    if (request.url?.split('?')[0] !== SUPERADMIN_GRAPHQL_PATH) return;
    const origin = request.headers.origin;
    const protocols = request.headers['sec-websocket-protocol']
      ?.split(',')
      .map((value) => value.trim());
    if (
      this.stopped ||
      request.url !== SUPERADMIN_GRAPHQL_PATH ||
      !origin ||
      !this.options.allowedOrigins.includes(origin) ||
      !protocols?.includes(GRAPHQL_TRANSPORT_WS_PROTOCOL)
    ) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    if ((this.sockets?.clients.size ?? 0) >= SUPERADMIN_WS_LIMITS.connections) {
      socket.end(
        'HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\nContent-Length: 0\r\n\r\n',
      );
      return;
    }
    this.sockets?.handleUpgrade(request, socket, head, (client) =>
      this.sockets?.emit('connection', client, request),
    );
  };

  private register(input: { socket: WebSocket; request: IncomingMessage }): void {
    const cookies = cookieParser.JSONCookies(this.readCookies(input.request));
    const token: unknown = cookies.superadminSession;
    const cleanup = new Set<() => void>();
    const connection: Connection = {
      socket: input.socket,
      token: typeof token === 'string' ? token : null,
      sessionId: null,
      operationId: null,
      closed: false,
      cleanup,
      nonce: null,
      pongDeadline: null,
      ping: setInterval(() => this.ping(connection), SUPERADMIN_WS_LIMITS.pingMs),
      context: {
        transport: 'ws',
        request: input.request,
        principal: null,
        lifecycle: {
          assertAuthorized: () => this.authorize(connection),
          unavailable: (): void => {
            if (!connection.closed)
              this.close({ connection, code: 1013, reason: 'Service unavailable' });
          },
          onClose: (callback): (() => void) => {
            if (connection.closed) callback();
            else cleanup.add(callback);
            return (): void => {
              cleanup.delete(callback);
            };
          },
        },
      },
    };
    connection.ping.unref();
    const pong = (data: Buffer): void => {
      if (connection.nonce !== null && data.toString() === connection.nonce) {
        clearTimeout(connection.pongDeadline ?? undefined);
        connection.pongDeadline = null;
        connection.nonce = null;
      }
    };
    input.socket.on('pong', pong);
    input.socket.once('close', () => {
      this.release(connection);
      input.socket.off('pong', pong);
    });
    this.connections.set(input.socket, connection);
  }

  private readCookies(request: IncomingMessage): Record<string, string> {
    // cookie-parser is the HTTP convention; upgrade requests have not traversed its middleware.
    const parsed: Record<string, string> = Object.create(null) as Record<string, string>;
    for (const entry of request.headers.cookie?.split(';') ?? []) {
      const index = entry.indexOf('=');
      if (index < 1) continue;
      const name = entry.slice(0, index).trim();
      if (Object.hasOwn(parsed, name)) continue;
      try {
        parsed[name] = decodeURIComponent(entry.slice(index + 1).trim());
      } catch {
        /* Invalid cookies cannot authenticate. */
      }
    }
    return parsed;
  }

  private async authorize(connection: Connection): Promise<AdminPrincipal> {
    connection.context.principal = null;
    let principal: AdminPrincipal | null;
    try {
      principal = await this.verifier.verifyWithoutTouch({ sessionToken: connection.token });
    } catch {
      this.close({ connection, code: 1013, reason: 'Service unavailable' });
      throw superadminWsError('UPSTREAM_UNAVAILABLE');
    }
    if (
      connection.closed ||
      this.stopped ||
      !principal ||
      principal.role !== 'SUPERADMIN' ||
      !principal.sessionId ||
      (connection.sessionId !== null && principal.sessionId !== connection.sessionId)
    ) {
      this.close({ connection, code: 4401, reason: 'Unauthorized' });
      throw superadminWsError('UNAUTHENTICATED');
    }
    if (connection.sessionId === null) {
      const count = [...this.connections.values()].filter(
        (entry) => entry.sessionId === principal.sessionId && !entry.closed,
      ).length;
      if (count >= SUPERADMIN_WS_LIMITS.sessionConnections) {
        this.close({ connection, code: 4403, reason: 'Limit exceeded' });
        throw superadminWsError('TOO_MANY_REQUESTS');
      }
      connection.sessionId = principal.sessionId;
    }
    connection.context.principal = principal;
    return principal;
  }

  private ping(connection: Connection): void {
    if (connection.closed || connection.nonce !== null) return;
    connection.nonce = randomUUID();
    connection.pongDeadline = setTimeout(() => {
      this.release(connection);
      connection.socket.terminate();
    }, SUPERADMIN_WS_LIMITS.pongMs);
    connection.pongDeadline.unref();
    connection.socket.ping(connection.nonce, false, (error?: Error) => {
      if (error) {
        this.release(connection);
        connection.socket.terminate();
      }
    });
  }

  private async checkSessions(): Promise<void> {
    if (this.sweeping || this.stopped) return;
    this.sweeping = true;
    try {
      await Promise.all(
        [...this.connections.values()]
          .filter((entry) => entry.sessionId !== null)
          .map(async (entry): Promise<void> => {
            try {
              await this.authorize(entry);
            } catch {
              /* authorize closes fail-closed. */
            }
          }),
      );
    } finally {
      this.sweeping = false;
    }
  }

  private close(input: { connection: Connection; code: number; reason: string }): void {
    this.release(input.connection);
    input.connection.socket.close(input.code, input.reason);
  }

  private release(connection: Connection): void {
    if (connection.closed) return;
    connection.closed = true;
    connection.context.principal = null;
    clearInterval(connection.ping);
    clearTimeout(connection.pongDeadline ?? undefined);
    for (const callback of connection.cleanup) {
      try {
        callback();
      } catch {
        /* Independent cleanup callbacks must all run. */
      }
    }
    connection.cleanup.clear();
    this.connections.delete(connection.socket);
  }

  private complete(input: { socket: WebSocket; id: string }): void {
    const connection = this.connections.get(input.socket);
    if (connection?.operationId === input.id) connection.operationId = null;
  }

  private safeError(error: unknown): GraphQLError {
    const wrapped =
      error instanceof GraphQLError ? error : new GraphQLError('Internal server error');
    const safe = formatSuperadminError({ formatted: wrapped.toJSON(), error: wrapped });
    return new GraphQLError(safe.message, { extensions: safe.extensions, path: safe.path });
  }

  private safeResult(
    result: ExecutionResult,
  ): ExecutionResult & { errors?: readonly GraphQLFormattedError[] } {
    return {
      ...result,
      ...(result.errors ? { errors: result.errors.map((error) => this.safeError(error)) } : {}),
    };
  }

  async onModuleDestroy(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.server?.off('upgrade', this.upgrade);
    if (this.sweep) clearInterval(this.sweep);
    for (const connection of this.connections.values())
      this.close({ connection, code: 1001, reason: 'Going away' });
    const deadline = setTimeout(() => {
      for (const socket of this.sockets?.clients ?? []) socket.terminate();
    }, 5000);
    try {
      await this.disposable?.dispose();
    } finally {
      clearTimeout(deadline);
      this.sweep = null;
    }
  }
}
