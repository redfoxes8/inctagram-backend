import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { isUUID } from 'class-validator';

import {
  NOTIFICATION_CREATED_EVENT_TYPE,
  NOTIFICATION_CREATED_ROUTING_KEY,
  NOTIFICATION_EVENT_VERSION,
  PaymentNotificationType,
  type NotificationCreatedV1,
  type NotificationItemV1,
} from '../../../../../../libs/contracts/src';
import { COMMON_RABBITMQ_EXCHANGE } from '../../../core/gateway-rabbitmq.constants';
import { NotificationRealtimePublisher } from '../realtime/notification-realtime.publisher';
import {
  GATEWAY_NOTIFICATION_LIVE_EVENT_VERSION,
  GATEWAY_NOTIFICATION_UNSEEN_COUNT_CHANGED_EVENT_TYPE,
  GATEWAY_NOTIFICATION_UNSEEN_COUNT_CHANGED_ROUTING_KEY,
} from './notification-live-event.constants';
import type {
  GatewayNotificationLiveEvent,
  GatewayNotificationUnseenCountChangedV1,
} from './notification-live-event.types';

const LIVE_NOTIFICATION_ROUTING_KEYS = [
  NOTIFICATION_CREATED_ROUTING_KEY,
  GATEWAY_NOTIFICATION_UNSEEN_COUNT_CHANGED_ROUTING_KEY,
] as const;

@Injectable()
export class NotificationLiveEventConsumer implements OnApplicationBootstrap {
  private readonly logger = new Logger(NotificationLiveEventConsumer.name);
  private registration: Promise<void> | undefined;

  constructor(
    private readonly amqpConnection: AmqpConnection,
    private readonly realtimePublisher: NotificationRealtimePublisher,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    if (this.registration) return this.registration;
    this.registration = this.register();
    return this.registration;
  }

  private async register(): Promise<void> {
    await this.amqpConnection.createSubscriber(
      (input: unknown): Promise<void> => Promise.resolve(this.consume(input)),
      {
        exchange: COMMON_RABBITMQ_EXCHANGE,
        routingKey: [...LIVE_NOTIFICATION_ROUTING_KEYS],
        queueOptions: {
          durable: false,
          exclusive: true,
          autoDelete: true,
        },
      },
      NotificationLiveEventConsumer.name,
    );
  }

  private consume(input: unknown): void {
    const event = this.parse(input);
    if (!event) {
      this.logger.warn({
        message: 'Notification live event rejected',
        errorKind: 'INVALID_EVENT',
      });
      return;
    }

    if (event.eventType === NOTIFICATION_CREATED_EVENT_TYPE) {
      this.realtimePublisher.publishNotificationCreated(event.payload.userId, {
        notification: this.publicNotification(event.payload.notification),
        unseenCount: event.payload.unseenCount,
      });
      this.realtimePublisher.publishUnseenCount(event.payload.userId, {
        unseenCount: event.payload.unseenCount,
      });
      return;
    }

    this.realtimePublisher.publishUnseenCount(event.payload.userId, {
      unseenCount: event.payload.unseenCount,
      seenThrough: event.payload.seenThrough,
    });
  }

  private parse(input: unknown): GatewayNotificationLiveEvent | undefined {
    const value = this.normalize(input);
    if (!this.isRecord(value)) return undefined;
    if (value.eventType === NOTIFICATION_CREATED_EVENT_TYPE) {
      return this.isNotificationCreated(value) ? value : undefined;
    }
    if (value.eventType === GATEWAY_NOTIFICATION_UNSEEN_COUNT_CHANGED_EVENT_TYPE) {
      return this.isUnseenCountChanged(value) ? value : undefined;
    }
    return undefined;
  }

  private normalize(input: unknown): unknown {
    if (!Buffer.isBuffer(input) && typeof input !== 'string') return input;
    try {
      return JSON.parse(Buffer.isBuffer(input) ? input.toString('utf8') : input) as unknown;
    } catch {
      return undefined;
    }
  }

  private isNotificationCreated(value: Record<string, unknown>): value is NotificationCreatedV1 {
    const payload = value.payload;
    return (
      value.version === NOTIFICATION_EVENT_VERSION &&
      value.eventType === NOTIFICATION_CREATED_EVENT_TYPE &&
      value.routingKey === NOTIFICATION_CREATED_ROUTING_KEY &&
      value.aggregateType === 'NOTIFICATION' &&
      isUUID(value.eventId) &&
      isUUID(value.aggregateId) &&
      this.isUtcTimestamp(value.occurredAt) &&
      this.isRecord(payload) &&
      isUUID(payload.userId) &&
      this.isNotificationItem(payload.notification) &&
      this.isUnseenCount(payload.unseenCount)
    );
  }

  private isUnseenCountChanged(
    value: Record<string, unknown>,
  ): value is GatewayNotificationUnseenCountChangedV1 {
    const payload = value.payload;
    return (
      value.version === GATEWAY_NOTIFICATION_LIVE_EVENT_VERSION &&
      value.eventType === GATEWAY_NOTIFICATION_UNSEEN_COUNT_CHANGED_EVENT_TYPE &&
      value.routingKey === GATEWAY_NOTIFICATION_UNSEEN_COUNT_CHANGED_ROUTING_KEY &&
      value.aggregateType === 'USER_NOTIFICATION_STATE' &&
      isUUID(value.eventId) &&
      isUUID(value.aggregateId) &&
      this.isUtcTimestamp(value.occurredAt) &&
      this.isRecord(payload) &&
      isUUID(payload.userId) &&
      payload.userId === value.aggregateId &&
      this.isUnseenCount(payload.unseenCount) &&
      this.isUtcTimestamp(payload.seenThrough)
    );
  }

  private isNotificationItem(value: unknown): value is NotificationItemV1 {
    if (!this.isRecord(value)) return false;
    return (
      isUUID(value.id) &&
      this.isNotificationType(value.type) &&
      this.isUuidOrNull(value.subscriptionId) &&
      this.isStringOrNull(value.providerInvoiceId) &&
      this.isUtcTimestamp(value.effectiveAt) &&
      this.isTimestampOrNull(value.subscriptionEndsAt) &&
      this.isStringOrNull(value.reasonCode) &&
      this.isUtcTimestamp(value.createdAt) &&
      this.isTimestampOrNull(value.seenAt)
    );
  }

  private publicNotification(notification: NotificationItemV1): NotificationItemV1 {
    return {
      id: notification.id,
      type: notification.type,
      subscriptionId: notification.subscriptionId,
      providerInvoiceId: notification.providerInvoiceId,
      effectiveAt: notification.effectiveAt,
      subscriptionEndsAt: notification.subscriptionEndsAt,
      reasonCode: notification.reasonCode,
      createdAt: notification.createdAt,
      seenAt: notification.seenAt,
    };
  }

  private isNotificationType(value: unknown): value is NotificationItemV1['type'] {
    return (
      typeof value === 'string' &&
      Object.values(PaymentNotificationType).some((type) => type === value)
    );
  }

  private isUnseenCount(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  }

  private isUtcTimestamp(value: unknown): value is string {
    return (
      typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
      !Number.isNaN(Date.parse(value))
    );
  }

  private isTimestampOrNull(value: unknown): value is string | null {
    return value === null || this.isUtcTimestamp(value);
  }

  private isUuidOrNull(value: unknown): value is string | null {
    return value === null || isUUID(value);
  }

  private isStringOrNull(value: unknown): value is string | null {
    return value === null || typeof value === 'string';
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
