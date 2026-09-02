import { Injectable } from '@nestjs/common';
import amqp from 'amqplib';

import { PaymentConfig } from '../../../../core/payment.config';
import {
  ClaimedPaymentOutboxEvent,
  IPaymentOutboxPublisher,
} from '../../application/ports/payment-outbox-relay.port';

const PAYMENT_EVENTS_EXCHANGE = 'common_exchange';

type ReturnedMessage = { properties: { messageId?: string } };

type PaymentConfirmChannel = {
  assertExchange(
    exchange: string,
    type: string,
    options: { durable: boolean; autoDelete: boolean },
  ): Promise<unknown>;
  publish(
    exchange: string,
    routingKey: string,
    content: Buffer,
    options: {
      persistent: boolean;
      mandatory: boolean;
      messageId: string;
      type: string;
      contentType: string;
      timestamp: number;
    },
    callback: (error: Error | null) => void,
  ): boolean;
  on(event: 'return', listener: (message: ReturnedMessage) => void): void;
  on(event: 'error' | 'close', listener: () => void): void;
  off(event: 'return', listener: (message: ReturnedMessage) => void): void;
  off(event: 'error' | 'close', listener: () => void): void;
  close(): Promise<void>;
};

type PaymentRabbitConnection = {
  createConfirmChannel(): Promise<PaymentConfirmChannel>;
  close(): Promise<void>;
};

@Injectable()
export class PaymentOutboxPublisher implements IPaymentOutboxPublisher {
  private connection: PaymentRabbitConnection | null = null;
  private channel: PaymentConfirmChannel | null = null;

  constructor(private readonly config: PaymentConfig) {}

  public async publish(event: ClaimedPaymentOutboxEvent): Promise<void> {
    this.assertEvent(event);
    const channel = await this.getChannel();
    const body = Buffer.from(
      JSON.stringify({
        eventId: event.id,
        version: event.eventVersion,
        eventType: event.eventType,
        occurredAt: event.occurredAt.toISOString(),
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        routingKey: event.routingKey,
        payload: event.payload,
      }),
    );

    await this.confirmPublish(channel, event, body);
  }

  public async close(): Promise<void> {
    const channel = this.channel;
    const connection = this.connection;
    this.channel = null;
    this.connection = null;
    if (channel) await channel.close().catch(() => undefined);
    if (connection) await connection.close().catch(() => undefined);
  }

  private async getChannel(): Promise<PaymentConfirmChannel> {
    if (!this.config.outboxRelayEnabled || !this.config.rabbitUrl) {
      throw new Error('PAYMENT_OUTBOX_RELAY_DISABLED');
    }
    if (this.channel) return this.channel;

    const connection = (await amqp.connect(this.config.rabbitUrl)) as PaymentRabbitConnection;
    try {
      const channel = await connection.createConfirmChannel();
      await channel.assertExchange(PAYMENT_EVENTS_EXCHANGE, 'topic', {
        durable: true,
        autoDelete: false,
      });
      this.connection = connection;
      this.channel = channel;
      return channel;
    } catch {
      await connection.close().catch(() => undefined);
      throw new Error('OUTBOX_BROKER_CONNECTION_FAILED');
    }
  }

  private confirmPublish(
    channel: PaymentConfirmChannel,
    event: ClaimedPaymentOutboxEvent,
    body: Buffer,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let returned = false;
      const onReturn = (message: ReturnedMessage): void => {
        if (message.properties.messageId === event.id) returned = true;
      };
      let settled = false;
      const cleanup = (): void => {
        channel.off('return', onReturn);
        channel.off('error', onChannelFailure);
        channel.off('close', onChannelFailure);
      };
      const onChannelFailure = (): void => {
        if (settled) return;
        settled = true;
        cleanup();
        this.channel = null;
        this.connection = null;
        reject(new Error('OUTBOX_BROKER_CHANNEL_FAILED'));
      };
      channel.on('return', onReturn);
      channel.on('error', onChannelFailure);
      channel.on('close', onChannelFailure);
      channel.publish(
        PAYMENT_EVENTS_EXCHANGE,
        event.routingKey,
        body,
        {
          persistent: true,
          mandatory: true,
          messageId: event.id,
          type: event.eventType,
          contentType: 'application/json',
          timestamp: Math.floor(event.occurredAt.getTime() / 1_000),
        },
        (error: Error | null): void => {
          setImmediate(() => {
            if (settled) return;
            settled = true;
            cleanup();
            if (error) {
              reject(new Error('OUTBOX_BROKER_NACK'));
              return;
            }
            if (returned) {
              reject(new Error('OUTBOX_MESSAGE_UNROUTABLE'));
              return;
            }
            resolve();
          });
        },
      );
    });
  }

  private assertEvent(event: ClaimedPaymentOutboxEvent): void {
    const expected: Readonly<Record<string, { routingKey: string; aggregateType: string }>> = {
      'payment.succeeded.v1': {
        routingKey: 'payment.succeeded',
        aggregateType: 'PAYMENT_TRANSACTION',
      },
      'payment.failed.v1': {
        routingKey: 'payment.failed',
        aggregateType: 'PAYMENT_TRANSACTION',
      },
      'subscription.queued.v1': {
        routingKey: 'subscription.queued',
        aggregateType: 'SUBSCRIPTION',
      },
      'subscription.activated.v1': {
        routingKey: 'subscription.activated',
        aggregateType: 'SUBSCRIPTION',
      },
      'subscription.expired.v1': {
        routingKey: 'payment.subscription.expired',
        aggregateType: 'SUBSCRIPTION',
      },
      'subscription.auto-renew.changed.v1': {
        routingKey: 'subscription.auto-renew.changed',
        aggregateType: 'SUBSCRIPTION',
      },
    };
    const contract = expected[event.eventType];
    const notificationContract =
      event.eventType === 'payment.notification.requested.v1' &&
      event.routingKey === 'payment.notification.requested' &&
      (event.aggregateType === 'SUBSCRIPTION' || event.aggregateType === 'PAYMENT_TRANSACTION');
    if (
      event.eventVersion !== 1 ||
      (!notificationContract &&
        (!contract ||
          contract.routingKey !== event.routingKey ||
          contract.aggregateType !== event.aggregateType)) ||
      !Number.isFinite(event.occurredAt.getTime())
    ) {
      throw new Error('OUTBOX_EVENT_CONTRACT_INVALID');
    }
  }
}
