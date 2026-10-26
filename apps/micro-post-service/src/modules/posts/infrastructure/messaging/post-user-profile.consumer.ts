import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PostConfig } from '../../../../core/post.config';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { PostAdminUserProfileRepository } from '../repositories/post-admin-user-profile.repository';
import {
  connectPaymentProfileBroker,
  PaymentProfileConfirmPublisher,
  type ProfileBrokerConnection,
  type ProfileConsumerChannel,
  type ProfileMessage,
} from '../../../../../../../libs/common/src/messaging/payment-profile-confirm-publisher';
import { parsePaymentUserProfileChangedV1 } from '../../../../../../../libs/contracts/src/events/payment-user-profile-changed-v1.event';
import { normalizePaymentUserProfileSnapshot } from '../../../../../../../libs/contracts/src/events/payment-user-profile-snapshot';
import * as topology from '../../../../../../../libs/contracts/src/events/post-user-profile-delivery';

type PostConsumerChannel = ProfileConsumerChannel & {
  cancel(consumerTag: string): Promise<unknown>;
};
type PostConsumerSession = {
  connection: ProfileBrokerConnection;
  channel: PostConsumerChannel;
  consumerTag: string | null;
};
type ForwardReason = 'INVALID_EVENT' | 'PROTOCOL_CONFLICT' | 'STORAGE_UNAVAILABLE';

@Injectable()
export class PostUserProfileConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PostUserProfileConsumer.name);
  private session: PostConsumerSession | null = null;
  private publisher: PaymentProfileConfirmPublisher | null = null;
  private opening: Promise<void> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly pending = new Set<Promise<void>>();
  private stopped = false;
  private failures = 0;
  private readonly connectedListeners = new Set<() => void>();

  onConnected(listener: () => void): () => void {
    this.connectedListeners.add(listener);
    return (): void => {
      this.connectedListeners.delete(listener);
    };
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: PostConfig,
  ) {}

  isConnected(): boolean {
    return !this.stopped && this.opening === null && this.session?.consumerTag != null;
  }

  onModuleInit(): void {
    void this.connect();
  }

  async connect(): Promise<void> {
    if (!this.config.userProjectionSyncEnabled || this.stopped || this.session || this.opening)
      return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.opening = this.open();
    try {
      await this.opening;
    } catch {
      this.scheduleReconnect();
    } finally {
      this.opening = null;
      if (this.isConnected()) {
        for (const listener of this.connectedListeners) {
          try {
            listener();
          } catch {
            /* A wake-up cannot invalidate the consumer connection. */
          }
        }
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    this.connectedListeners.clear();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    await this.opening?.catch(() => undefined);
    const session = this.session;
    this.session = null;
    if (session?.consumerTag)
      await session.channel.cancel(session.consumerTag).catch(() => undefined);
    await Promise.all(this.pending);
    if (session) await session.connection.close().catch(() => undefined);
    await this.publisher?.close();
  }

  private async open(): Promise<void> {
    const connection = await connectPaymentProfileBroker(this.config.rabbitUrl);
    let active: PostConsumerSession | null = null;
    let failed = false;
    const disconnected = (): void => {
      failed = true;
      if (active) void this.disconnect(active);
    };
    connection.on('error', disconnected);
    connection.on('close', disconnected);
    try {
      const channel = (await connection.createChannel()) as PostConsumerChannel;
      channel.on('error', disconnected);
      channel.on('close', disconnected);
      await this.prepareTopology(channel);
      if (failed || this.stopped) {
        await connection.close().catch(() => undefined);
        if (failed && !this.stopped) throw new Error('POST_PROFILE_CONNECTION_LOST');
        return;
      }
      active = { connection, channel, consumerTag: null };
      this.session = active;
      this.publisher ??= new PaymentProfileConfirmPublisher(this.config.rabbitUrl);
      const session = active;
      const result = (await channel.consume(
        topology.POST_PROFILE_QUEUE,
        (message) => {
          if (!message) {
            void this.disconnect(session);
            return;
          }
          this.trackMessage({ session, message });
        },
        { noAck: false },
      )) as { consumerTag: string };
      session.consumerTag = result.consumerTag;
    } catch {
      if (this.session === active) this.session = null;
      await connection.close().catch(() => undefined);
      throw new Error('POST_PROFILE_CONSUMER_UNAVAILABLE');
    }
  }

  private async prepareTopology(channel: PostConsumerChannel): Promise<void> {
    await channel.assertExchange(topology.POST_PROFILE_EXCHANGE, 'topic', {
      durable: true,
      autoDelete: false,
    });
    const durable = { durable: true, exclusive: false, autoDelete: false };
    await channel.assertQueue(topology.POST_PROFILE_QUEUE, durable);
    for (const key of [topology.POST_PROFILE_SOURCE_KEY, topology.POST_PROFILE_RETRY_KEY]) {
      await channel.bindQueue(topology.POST_PROFILE_QUEUE, topology.POST_PROFILE_EXCHANGE, key);
    }
    // Retry is addressed through the default exchange by queue name; only its DLX uses RETRY_KEY.
    await channel.assertQueue(topology.POST_PROFILE_RETRY_QUEUE, {
      ...durable,
      arguments: {
        'x-message-ttl': topology.POST_PROFILE_RETRY_TTL_MS,
        'x-dead-letter-exchange': topology.POST_PROFILE_EXCHANGE,
        'x-dead-letter-routing-key': topology.POST_PROFILE_RETRY_KEY,
      },
    });
    await channel.assertQueue(topology.POST_PROFILE_DLQ, durable);
    await channel.bindQueue(
      topology.POST_PROFILE_DLQ,
      topology.POST_PROFILE_EXCHANGE,
      topology.POST_PROFILE_DLQ_KEY,
    );
    await channel.prefetch(1);
  }

  private trackMessage(input: { session: PostConsumerSession; message: ProfileMessage }): void {
    if (this.stopped || this.session !== input.session) return;
    const work = this.process(input).catch(() => this.disconnect(input.session));
    this.pending.add(work);
    void work.finally(() => this.pending.delete(work));
  }

  private async process(input: {
    session: PostConsumerSession;
    message: ProfileMessage;
  }): Promise<void> {
    let event: ReturnType<typeof parsePaymentUserProfileChangedV1>;
    try {
      event = parsePaymentUserProfileChangedV1(JSON.parse(input.message.content.toString('utf8')));
    } catch {
      await this.forward({ ...input, reason: 'INVALID_EVENT' });
      return;
    }
    const snapshot = normalizePaymentUserProfileSnapshot({
      userId: event.userId,
      sourceVersion: event.sourceVersion,
      username: event.username,
      profileExists: event.profileExists,
      isDeleted: event.isDeleted,
    });
    let conflict: boolean;
    try {
      const result = await this.prisma.$transaction((transaction) =>
        PostAdminUserProfileRepository.forTransaction({
          transaction,
          rootClient: this.prisma,
        }).apply(snapshot),
      );
      conflict = result.outcome === 'PROTOCOL_CONFLICT';
    } catch {
      await this.forward({ ...input, reason: 'STORAGE_UNAVAILABLE', eventId: event.eventId });
      return;
    }
    if (conflict)
      await this.forward({ ...input, reason: 'PROTOCOL_CONFLICT', eventId: event.eventId });
    else this.ack(input);
  }

  private async forward(input: {
    session: PostConsumerSession;
    message: ProfileMessage;
    reason: ForwardReason;
    eventId?: string;
  }): Promise<void> {
    if (!this.publisher || this.stopped || this.session !== input.session)
      throw new Error('POST_PROFILE_SESSION_CLOSED');
    const headers = input.message.properties.headers ?? {};
    const previous = headers[topology.POST_PROFILE_RETRY_HEADER];
    const attempts =
      typeof previous === 'number' && Number.isSafeInteger(previous) && previous >= 0
        ? previous
        : 0;
    const retry = input.reason === 'STORAGE_UNAVAILABLE';
    await this.publisher.publish({
      exchange: retry ? '' : undefined,
      routingKey: retry ? topology.POST_PROFILE_RETRY_QUEUE : topology.POST_PROFILE_DLQ_KEY,
      content: input.message.content,
      messageId: input.message.properties.messageId ?? input.eventId ?? randomUUID(),
      headers: {
        ...headers,
        [topology.POST_PROFILE_RETRY_HEADER]: Math.min(attempts + 1, 2147483647),
        'x-post-profile-reason': input.reason,
      },
    });
    this.ack(input);
    this.logger.warn({ event: 'post.profile.delivery', code: input.reason });
  }

  private ack(input: { session: PostConsumerSession; message: ProfileMessage }): void {
    if (!this.stopped && this.session === input.session) {
      input.session.channel.ack(input.message);
      this.failures = 0;
    }
  }

  private async disconnect(session: PostConsumerSession): Promise<void> {
    if (this.session !== session) return;
    this.session = null;
    this.scheduleReconnect();
    await session.connection.close().catch(() => undefined);
    await this.publisher?.close();
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    const delay = Math.min(60000, 30000 * 2 ** Math.min(this.failures++, 1));
    this.logger.warn({ event: 'post.profile.connection', code: 'RECONNECT_SCHEDULED' });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }
}
