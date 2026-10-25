import { Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PaymentConfig } from '../../../../core/payment.config';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { AdminUserProfileSnapshotRepository } from '../repositories/admin-user-profile-snapshot.repository';
import {
  connectPaymentProfileBroker,
  PaymentProfileConfirmPublisher,
  type ProfileBrokerConnection,
  type ProfileConsumerChannel,
  type ProfileMessage,
} from '../../../../../../../libs/common/src/messaging/payment-profile-confirm-publisher';
import {
  parsePaymentUserProfileChangedV1,
  type PaymentUserProfileChangedV1,
} from '../../../../../../../libs/contracts/src/events/payment-user-profile-changed-v1.event';
import * as topology from '../../../../../../../libs/contracts/src/events/payment-user-profile-delivery';
import { normalizePaymentUserProfileSnapshot } from '../../../../../../../libs/contracts/src/events/payment-user-profile-snapshot';

type ConsumerSession = { connection: ProfileBrokerConnection; channel: ProfileConsumerChannel };

@Injectable()
export class PaymentUserProfileConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentUserProfileConsumer.name);
  private session: ConsumerSession | null = null;
  private publisher: PaymentProfileConfirmPublisher | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private opening: Promise<void> | null = null;
  private inflight: Promise<void> | null = null;
  private stopped = false;
  private failures = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: PaymentConfig,
  ) {}

  onModuleInit(): void {
    if (this.config.userProjectionSyncEnabled) void this.connect();
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
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const session = this.session;
    this.session = null;
    if (session) await session.connection.close().catch(() => undefined);
    await this.opening?.catch(() => undefined);
    await this.inflight;
    await this.publisher?.close();
  }

  private async open(): Promise<void> {
    if (!this.config.rabbitUrl) throw new Error('PROFILE_BROKER_NOT_CONFIGURED');
    const connection = await connectPaymentProfileBroker(this.config.rabbitUrl);
    let session: ConsumerSession | null = null;
    const failed = (): void => {
      if (session && this.session === session) void this.disconnect(session);
    };
    connection.on('error', failed);
    connection.on('close', failed);
    try {
      const channel = await connection.createChannel();
      session = { connection, channel };
      channel.on('error', failed);
      channel.on('close', failed);
      await channel.assertExchange(topology.PAYMENT_PROFILE_EXCHANGE, 'topic', {
        durable: true,
        autoDelete: false,
      });
      await channel.assertQueue(topology.PAYMENT_PROFILE_QUEUE, {
        durable: true,
        exclusive: false,
        autoDelete: false,
      });
      await channel.bindQueue(
        topology.PAYMENT_PROFILE_QUEUE,
        topology.PAYMENT_PROFILE_EXCHANGE,
        topology.PAYMENT_PROFILE_ROUTING_KEY,
      );
      await channel.assertQueue(topology.PAYMENT_PROFILE_RETRY_QUEUE, {
        durable: true,
        exclusive: false,
        autoDelete: false,
        arguments: {
          'x-message-ttl': topology.PAYMENT_PROFILE_RETRY_TTL_MS,
          'x-dead-letter-exchange': topology.PAYMENT_PROFILE_EXCHANGE,
          'x-dead-letter-routing-key': topology.PAYMENT_PROFILE_ROUTING_KEY,
        },
      });
      await channel.bindQueue(
        topology.PAYMENT_PROFILE_RETRY_QUEUE,
        topology.PAYMENT_PROFILE_EXCHANGE,
        topology.PAYMENT_PROFILE_RETRY_ROUTING_KEY,
      );
      await channel.assertQueue(topology.PAYMENT_PROFILE_DLQ, {
        durable: true,
        exclusive: false,
        autoDelete: false,
      });
      await channel.bindQueue(
        topology.PAYMENT_PROFILE_DLQ,
        topology.PAYMENT_PROFILE_EXCHANGE,
        topology.PAYMENT_PROFILE_DLQ_ROUTING_KEY,
      );
      await channel.prefetch(1);
      if (this.stopped) {
        await connection.close();
        return;
      }
      this.session = session;
      this.publisher ??= new PaymentProfileConfirmPublisher(this.config.rabbitUrl);
      const active = session;
      await channel.consume(
        topology.PAYMENT_PROFILE_QUEUE,
        (message) => {
          if (!message) {
            void this.disconnect(active);
            return;
          }
          const work = this.process({ session: active, message }).catch(() =>
            this.disconnect(active),
          );
          this.inflight = work;
          void work.finally(() => {
            if (this.inflight === work) this.inflight = null;
          });
        },
        { noAck: false },
      );
    } catch {
      if (this.session === session) this.session = null;
      await connection.close().catch(() => undefined);
      throw new Error('PROFILE_CONSUMER_UNAVAILABLE');
    }
  }

  private async process(input: {
    session: ConsumerSession;
    message: ProfileMessage;
  }): Promise<void> {
    let event: PaymentUserProfileChangedV1;
    try {
      const payload: unknown = JSON.parse(input.message.content.toString('utf8'));
      event = parsePaymentUserProfileChangedV1(payload);
    } catch {
      await this.republish({ ...input, retry: false, reason: 'INVALID_EVENT' });
      return;
    }
    let conflict = false;
    try {
      const snapshot = normalizePaymentUserProfileSnapshot({
        userId: event.userId,
        sourceVersion: event.sourceVersion,
        username: event.username,
        profileExists: event.profileExists,
        isDeleted: event.isDeleted,
      });
      const result = await this.prisma.$transaction((transaction) =>
        AdminUserProfileSnapshotRepository.forTransaction({
          transaction,
          rootClient: this.prisma,
        }).apply(snapshot),
      );
      conflict = result.outcome === 'PROTOCOL_CONFLICT';
    } catch {
      await this.republish({ ...input, retry: true, reason: 'STORAGE_UNAVAILABLE' });
      return;
    }
    if (conflict) await this.republish({ ...input, retry: false, reason: 'PROTOCOL_CONFLICT' });
    else this.ack(input);
  }

  private async republish(input: {
    session: ConsumerSession;
    message: ProfileMessage;
    retry: boolean;
    reason: string;
  }): Promise<void> {
    if (!this.publisher) throw new Error('PROFILE_PUBLISHER_UNAVAILABLE');
    const headers = input.message.properties.headers ?? {};
    const count = headers[topology.PAYMENT_PROFILE_RETRY_HEADER];
    const attempts =
      typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 ? count : 0;
    await this.publisher.publish({
      routingKey: input.retry
        ? topology.PAYMENT_PROFILE_RETRY_ROUTING_KEY
        : topology.PAYMENT_PROFILE_DLQ_ROUTING_KEY,
      content: input.message.content,
      messageId: input.message.properties.messageId ?? randomUUID(),
      headers: {
        ...headers,
        [topology.PAYMENT_PROFILE_RETRY_HEADER]: Math.min(attempts + 1, 2147483647),
        'x-payment-profile-reason': input.reason,
      },
    });
    this.ack(input);
    this.logger.warn({ event: 'payment.profile.delivery', code: input.reason });
  }

  private ack(input: { session: ConsumerSession; message: ProfileMessage }): void {
    if (this.session === input.session && !this.stopped) {
      input.session.channel.ack(input.message);
      this.failures = 0;
    }
  }

  private async disconnect(session: ConsumerSession): Promise<void> {
    if (this.session !== session) return;
    this.session = null;
    this.scheduleReconnect();
    await session.connection.close().catch(() => undefined);
    await this.publisher?.close();
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    const delay = Math.min(60000, 30000 * 2 ** Math.min(this.failures++, 1));
    this.logger.warn({ event: 'payment.profile.connection', code: 'RECONNECT_SCHEDULED' });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }
}
