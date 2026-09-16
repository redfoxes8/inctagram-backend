import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import amqp from 'amqplib';

import { PaymentConfig } from '../../../../core/payment.config';
import { ProcessDuePaymentNotificationScheduleService } from '../../application/services/process-due-payment-notification-schedule.service';

const DELAY_QUEUE = 'payment-notification-schedule.delay';
const PROCESS_QUEUE = 'payment-notification-schedule.process';
const DLQ = 'payment-notification-schedule.dlq';
const RETRY_QUEUE = 'payment-notification-schedule.retry';
const DELAY_MILLISECONDS = 30_000;
const RETRY_DELAY_MILLISECONDS = 300_000;
const MAX_ATTEMPTS = 3;

type SchedulerMessage = Readonly<{
  content: Buffer;
  properties: Readonly<{ headers?: Record<string, unknown> }>;
}>;
type SchedulerChannel = {
  assertQueue(queue: string, options: object): Promise<unknown>;
  consume(queue: string, callback: (message: SchedulerMessage | null) => void): Promise<unknown>;
  ack(message: SchedulerMessage): void;
  nack(message: SchedulerMessage, allUpTo: boolean, requeue: boolean): void;
  close(): Promise<void>;
};
type SchedulerConfirmChannel = SchedulerChannel & {
  sendToQueue(
    queue: string,
    content: Buffer,
    options: object,
    callback: (error: Error | null) => void,
  ): boolean;
};
type SchedulerConnection = {
  createConfirmChannel(): Promise<SchedulerConfirmChannel>;
  createChannel(): Promise<SchedulerChannel>;
  close(): Promise<void>;
};

@Injectable()
export class PaymentNotificationSchedulerTransport
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(PaymentNotificationSchedulerTransport.name);
  private connection: SchedulerConnection | null = null;
  private publishChannel: SchedulerConfirmChannel | null = null;
  private consumeChannel: SchedulerChannel | null = null;
  private started = false;

  constructor(
    private readonly config: PaymentConfig,
    private readonly processor: ProcessDuePaymentNotificationScheduleService,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    if (!this.config.outboxRelayEnabled || !this.config.rabbitUrl || this.started) return;
    this.started = true;
    try {
      this.connection = (await amqp.connect(this.config.rabbitUrl, {
        clientProperties: { connection_name: 'payment-notification-scheduler' },
      })) as SchedulerConnection;
      this.publishChannel = await this.connection.createConfirmChannel();
      this.consumeChannel = await this.connection.createChannel();
      await this.declareTopology();
      await this.consumeChannel.consume(PROCESS_QUEUE, (message) => void this.consume(message));
    } catch {
      this.logger.error('Payment notification scheduler transport is unavailable');
      await this.onApplicationShutdown();
    }
  }

  public async wake(scheduleId: string): Promise<void> {
    if (!this.publishChannel) throw new Error('PAYMENT_NOTIFICATION_SCHEDULER_UNAVAILABLE');
    await this.publish(DELAY_QUEUE, Buffer.from(JSON.stringify({ scheduleId })));
  }

  public async onApplicationShutdown(): Promise<void> {
    const consumeChannel = this.consumeChannel;
    const publishChannel = this.publishChannel;
    const connection = this.connection;
    this.consumeChannel = null;
    this.publishChannel = null;
    this.connection = null;
    this.started = false;
    if (consumeChannel) await consumeChannel.close().catch(() => undefined);
    if (publishChannel) await publishChannel.close().catch(() => undefined);
    if (connection) await connection.close().catch(() => undefined);
  }

  private async declareTopology(): Promise<void> {
    if (!this.publishChannel) throw new Error('SCHEDULER_CHANNEL_UNAVAILABLE');
    await this.publishChannel.assertQueue(DLQ, { durable: true });
    await this.publishChannel.assertQueue(PROCESS_QUEUE, { durable: true });
    await this.publishChannel.assertQueue(RETRY_QUEUE, {
      durable: true,
      arguments: {
        'x-message-ttl': RETRY_DELAY_MILLISECONDS,
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': PROCESS_QUEUE,
      },
    });
    await this.publishChannel.assertQueue(DELAY_QUEUE, {
      durable: true,
      arguments: {
        'x-message-ttl': DELAY_MILLISECONDS,
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': PROCESS_QUEUE,
      },
    });
  }

  private async consume(message: SchedulerMessage | null): Promise<void> {
    if (!message || !this.consumeChannel) return;
    const scheduleId = this.parseScheduleId(message.content);
    if (!scheduleId) {
      await this.publishDiagnostic(DLQ, message.content, 'INVALID_EVENT');
      this.consumeChannel.ack(message);
      return;
    }
    try {
      await this.processor.process(scheduleId);
    } catch {
      const attempts = Number(message.properties.headers?.['x-notification-attempt'] ?? 0) + 1;
      const target = attempts >= MAX_ATTEMPTS ? DLQ : RETRY_QUEUE;
      const reason = attempts >= MAX_ATTEMPTS ? 'PROCESSING_ERROR' : 'RETRY';
      try {
        await this.publishDiagnostic(target, message.content, reason, attempts);
      } catch {
        await new Promise<void>((resolve) => setTimeout(resolve, RETRY_DELAY_MILLISECONDS));
        this.consumeChannel.nack(message, false, true);
        return;
      }
    }
    this.consumeChannel.ack(message);
  }

  private parseScheduleId(content: Buffer): string | null {
    try {
      const parsed: unknown = JSON.parse(content.toString('utf8'));
      if (!parsed || typeof parsed !== 'object' || !('scheduleId' in parsed)) return null;
      const value = (parsed as { scheduleId?: unknown }).scheduleId;
      return typeof value === 'string' && value.length > 0 ? value : null;
    } catch {
      return null;
    }
  }

  private publish(queue: string, content: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      this.publishChannel?.sendToQueue(
        queue,
        content,
        { persistent: true, mandatory: true },
        (error) => {
          if (error) reject(new Error(error.message));
          else resolve();
        },
      );
    });
  }

  private publishDiagnostic(
    queue: string,
    content: Buffer,
    reason: string,
    attempts = 0,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.publishChannel?.sendToQueue(
        queue,
        content,
        {
          persistent: true,
          mandatory: true,
          headers: { 'x-notification-reason': reason, 'x-notification-attempt': attempts },
        },
        (error) => (error ? reject(new Error(error.message)) : resolve()),
      );
    });
  }
}
