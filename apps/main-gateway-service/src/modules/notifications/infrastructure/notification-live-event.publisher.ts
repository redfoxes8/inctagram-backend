import { Injectable, Logger } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { randomUUID } from 'node:crypto';

import { COMMON_RABBITMQ_EXCHANGE } from '../../../core/gateway-rabbitmq.constants';
import {
  GATEWAY_NOTIFICATION_LIVE_EVENT_VERSION,
  GATEWAY_NOTIFICATION_UNSEEN_COUNT_CHANGED_EVENT_TYPE,
  GATEWAY_NOTIFICATION_UNSEEN_COUNT_CHANGED_ROUTING_KEY,
} from './notification-live-event.constants';
import type { GatewayNotificationUnseenCountChangedV1 } from './notification-live-event.types';

const LIVE_EVENT_PUBLISH_TIMEOUT_MS = 5_000;

type LiveEventPublishOptions = {
  persistent: true;
  mandatory: true;
  messageId: string;
  headers: Record<string, never>;
  timeout: number;
};

@Injectable()
export class NotificationLiveEventPublisher {
  private readonly logger = new Logger(NotificationLiveEventPublisher.name);

  constructor(private readonly amqpConnection: AmqpConnection) {}

  public async publishUnseenCountChanged(input: {
    userId: string;
    unseenCount: number;
    seenThrough: string;
  }): Promise<void> {
    const event: GatewayNotificationUnseenCountChangedV1 = {
      eventId: randomUUID(),
      version: GATEWAY_NOTIFICATION_LIVE_EVENT_VERSION,
      eventType: GATEWAY_NOTIFICATION_UNSEEN_COUNT_CHANGED_EVENT_TYPE,
      occurredAt: input.seenThrough,
      aggregateType: 'USER_NOTIFICATION_STATE',
      aggregateId: input.userId,
      routingKey: GATEWAY_NOTIFICATION_UNSEEN_COUNT_CHANGED_ROUTING_KEY,
      payload: input,
    };
    const publishOptions: LiveEventPublishOptions = {
      persistent: true,
      mandatory: true,
      messageId: event.eventId,
      headers: {},
      timeout: LIVE_EVENT_PUBLISH_TIMEOUT_MS,
    };

    try {
      const confirmed = await this.amqpConnection.publish(
        COMMON_RABBITMQ_EXCHANGE,
        GATEWAY_NOTIFICATION_UNSEEN_COUNT_CHANGED_ROUTING_KEY,
        event,
        publishOptions,
      );
      if (!confirmed) throw new Error('NOTIFICATION_UNSEEN_COUNT_PUBLISH_UNCONFIRMED');
    } catch (error: unknown) {
      this.logger.warn({
        message: 'Notification unseen-count realtime fan-out was not published',
        errorCode: this.errorCode(error),
      });
    }
  }

  private errorCode(error: unknown): string {
    return error instanceof Error ? error.message.slice(0, 100) : 'UNKNOWN_ERROR';
  }
}
