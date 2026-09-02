import { Injectable, Logger } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { randomUUID } from 'node:crypto';

import {
  NOTIFICATION_CREATED_EVENT_TYPE,
  NOTIFICATION_CREATED_ROUTING_KEY,
  type NotificationCreatedV1,
} from '../../../../../../../libs/contracts/src/events/notification-events-v1.event';
import { type NotificationOutbox } from '../../../../core/prisma/client';
import { PERSISTED_NOTIFICATION_EXCHANGE } from '../../api/rabbit/persisted-notification-rabbit.constants';
import { NotificationOutboxRepository } from '../repositories/notification-outbox.repository';

const OUTBOX_MAX_ATTEMPTS = 10;
const OUTBOX_RETRY_DELAY_MS = 60_000;

@Injectable()
export class NotificationOutboxPublisher {
  private readonly logger = new Logger(NotificationOutboxPublisher.name);
  private readonly workerId = `notification-outbox-${process.pid}-${randomUUID()}`;

  constructor(
    private readonly outbox: NotificationOutboxRepository,
    private readonly amqpConnection: AmqpConnection,
  ) {}

  public async publishByEventId(eventId: string): Promise<boolean> {
    const event = await this.outbox.claimByEventId({
      eventId,
      workerId: this.workerId,
      now: new Date(),
      batchSize: 1,
      maxAttempts: OUTBOX_MAX_ATTEMPTS,
    });
    if (!event) return false;
    return this.publishClaimed(event);
  }

  public async publishClaimed(event: NotificationOutbox): Promise<boolean> {
    try {
      const payload = this.payload(event);
      const confirmed = await this.amqpConnection.publish(
        PERSISTED_NOTIFICATION_EXCHANGE,
        NOTIFICATION_CREATED_ROUTING_KEY,
        payload,
        {
          persistent: true,
          mandatory: true,
          messageId: event.eventId,
          headers: {},
        },
      );
      if (!confirmed) throw new Error('NOTIFICATION_OUTBOX_PUBLISH_UNCONFIRMED');
      await this.outbox.markPublished(event.id, this.workerId, new Date());
      return true;
    } catch (error: unknown) {
      await this.outbox.markFailed({
        id: event.id,
        workerId: this.workerId,
        now: new Date(),
        errorCode: this.errorCode(error),
        retryDelayMs: OUTBOX_RETRY_DELAY_MS,
      });
      this.logger.warn({
        message: 'Notification outbox publish deferred for recovery',
        eventId: event.eventId,
        errorCode: this.errorCode(error),
      });
      return false;
    }
  }

  public options(): Readonly<{ workerId: string; maxAttempts: number }> {
    return { workerId: this.workerId, maxAttempts: OUTBOX_MAX_ATTEMPTS };
  }

  private payload(event: NotificationOutbox): NotificationCreatedV1 {
    const value = event.payload;
    const payload = this.isRecord(value) && this.isRecord(value.payload) ? value.payload : null;
    const unseenCount = payload?.unseenCount;
    if (
      !this.isRecord(value) ||
      value.eventType !== NOTIFICATION_CREATED_EVENT_TYPE ||
      value.routingKey !== NOTIFICATION_CREATED_ROUTING_KEY ||
      !payload ||
      typeof unseenCount !== 'number' ||
      !Number.isSafeInteger(unseenCount) ||
      unseenCount < 0
    ) {
      throw new Error('NOTIFICATION_OUTBOX_PAYLOAD_INVALID');
    }
    return value as unknown as NotificationCreatedV1;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private errorCode(error: unknown): string {
    if (error instanceof Error) return error.message.slice(0, 100);
    return 'UNKNOWN_ERROR';
  }
}
