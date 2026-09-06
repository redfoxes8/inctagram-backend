import { createServer, type Server as HttpServer } from 'node:http';

import {
  type AuthTokens,
  IJwtService,
  type TokenPayload,
} from '../../src/modules/auth/application/interfaces/jwt.service.interface';
import { NotificationsController } from '../../src/modules/notifications/api/notifications.controller';
import { NotificationsGateway } from '../../src/modules/notifications/api/ws/notifications.gateway';
import { NotificationGrpcClient } from '../../src/modules/notifications/infrastructure/notification-grpc.client';
import { NotificationRealtimePublisher } from '../../src/modules/notifications/realtime/notification-realtime.publisher';
import { NotificationUserRoomFactory } from '../../src/modules/notifications/realtime/notification-user-room.factory';
import { NOTIFICATION_WEBSOCKET_EVENT } from '../../../../libs/contracts/src';
import { io, type Socket as ClientSocket } from 'socket.io-client';
import { Server, type Namespace } from 'socket.io';

const FIRST_USER_ID = '10000000-0000-4000-8000-000000000001';
const SECOND_USER_ID = '20000000-0000-4000-8000-000000000001';

class TestJwtService extends IJwtService {
  public createTokens(): AuthTokens {
    throw new Error('Not used by WebSocket authentication');
  }

  public getPayload(): Promise<TokenPayload | null> {
    throw new Error('Not used by WebSocket authentication');
  }

  public verifyAccessToken(token: string): TokenPayload {
    if (token === 'access-first-user') {
      return this.payload(FIRST_USER_ID);
    }
    if (token === 'access-second-user') {
      return this.payload(SECOND_USER_ID);
    }
    throw new Error('Unauthorized');
  }

  public verifyRefreshToken(): TokenPayload {
    throw new Error('Not used by WebSocket authentication');
  }

  private payload(userId: string): TokenPayload {
    return {
      userId,
      deviceId: '30000000-0000-4000-8000-000000000001',
      tokenType: 'ACCESS',
      iat: 0,
      exp: 4_102_444_800,
    };
  }
}

describe('NotificationsGateway', () => {
  let httpServer: HttpServer;
  let socketServer: Server;
  let namespace: Namespace;
  let publisher: NotificationRealtimePublisher;
  let gateway: NotificationsGateway;
  let origin: string;
  const clients: ClientSocket[] = [];

  beforeEach(async () => {
    httpServer = createServer();
    socketServer = new Server(httpServer, {
      path: '/socket.io',
      transports: ['websocket'],
      cors: { origin: ['http://localhost:3000'], credentials: true },
    });
    namespace = socketServer.of('/notifications');
    publisher = new NotificationRealtimePublisher();
    gateway = new NotificationsGateway(new TestJwtService(), publisher);
    gateway.afterInit(namespace);
    namespace.on('connection', (socket) => gateway.handleConnection(socket));

    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const address = httpServer.address();
    if (!address || typeof address === 'string') {
      throw new Error('Test Socket.IO server did not expose a TCP address');
    }
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    clients.forEach((client) => client.disconnect());
    await socketServer.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it('rejects unauthenticated connections and derives the room only from verified access JWT', async () => {
    await expect(rejectedConnection(undefined)).resolves.toEqual({
      code: 'UNAUTHORIZED',
      message: 'Unauthorized',
    });
    await expect(rejectedConnection('refresh-token')).resolves.toEqual({
      code: 'UNAUTHORIZED',
      message: 'Unauthorized',
    });
    await expect(rejectedConnection('legacy-token')).resolves.toEqual({
      code: 'UNAUTHORIZED',
      message: 'Unauthorized',
    });

    const socket = await connectedSocket({
      accessToken: 'access-first-user',
      userId: SECOND_USER_ID,
    });
    await nextTick();

    expect(namespace.adapter.rooms.has(NotificationUserRoomFactory.forUser(FIRST_USER_ID))).toBe(
      true,
    );
    expect(namespace.adapter.rooms.has(NotificationUserRoomFactory.forUser(SECOND_USER_ID))).toBe(
      false,
    );
    expect(socket.connected).toBe(true);
  });

  it('delivers mark-seen unseen count to both local user tabs after one gRPC call', async () => {
    const firstTab = await connectedSocket({ accessToken: 'access-first-user' });
    const secondTab = await connectedSocket({ accessToken: 'access-first-user' });
    const otherUserTab = await connectedSocket({ accessToken: 'access-second-user' });
    await nextTick();

    const markNotificationsSeen = jest.fn().mockResolvedValue({
      seenThrough: { seconds: 1_788_260_500, nanos: 0 },
      unseenCount: 0,
    });
    const getNotifications = jest.fn();
    const getUnseenNotificationCount = jest.fn();
    const notificationGrpcClient = {
      markNotificationsSeen,
      getNotifications,
      getUnseenNotificationCount,
    } as unknown as NotificationGrpcClient;
    const controller = new NotificationsController(notificationGrpcClient, publisher);
    const firstEvent = event(firstTab, NOTIFICATION_WEBSOCKET_EVENT.UNSEEN_COUNT);
    const secondEvent = event(secondTab, NOTIFICATION_WEBSOCKET_EVENT.UNSEEN_COUNT);
    const otherUserListener = jest.fn();
    otherUserTab.on(NOTIFICATION_WEBSOCKET_EVENT.UNSEEN_COUNT, otherUserListener);

    await expect(controller.markNotificationsSeen(FIRST_USER_ID)).resolves.toEqual({
      seenThrough: '2026-09-01T11:01:40.000Z',
      unseenCount: 0,
    });
    await expect(Promise.all([firstEvent, secondEvent])).resolves.toEqual([
      { unseenCount: 0 },
      { unseenCount: 0 },
    ]);
    await nextTick();

    expect(markNotificationsSeen).toHaveBeenCalledTimes(1);
    expect(markNotificationsSeen).toHaveBeenCalledWith({ userId: FIRST_USER_ID });
    expect(getUnseenNotificationCount).not.toHaveBeenCalled();
    expect(getNotifications).not.toHaveBeenCalled();
    expect(otherUserListener).not.toHaveBeenCalled();
  });

  function connectedSocket(auth: Record<string, string>): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const socket = io(`${origin}/notifications`, {
        path: '/socket.io',
        transports: ['websocket'],
        auth,
        reconnection: false,
      });
      clients.push(socket);
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', reject);
    });
  }

  function rejectedConnection(
    accessToken: string | undefined,
  ): Promise<{ code: string; message: string }> {
    return new Promise((resolve) => {
      const socket = io(`${origin}/notifications`, {
        path: '/socket.io',
        transports: ['websocket'],
        auth: accessToken ? { accessToken } : {},
        reconnection: false,
      });
      clients.push(socket);
      socket.once('connect_error', (error) => {
        resolve({
          code: typeof error.data?.code === 'string' ? error.data.code : '',
          message: error.message,
        });
      });
    });
  }

  function event(socket: ClientSocket, event: string): Promise<unknown> {
    return new Promise((resolve) => socket.once(event, resolve));
  }

  function nextTick(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
  }
});
