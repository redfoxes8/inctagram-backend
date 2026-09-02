import { Injectable, Logger } from '@nestjs/common';
import {
  AmqpConnection,
  Nack,
  RabbitPayload,
  RabbitRequest,
  RabbitSubscribe,
} from '@golevelup/nestjs-rabbitmq';
import { isUUID } from 'class-validator';

import {
  PAYMENT_NOTIFICATION_REQUESTED_EVENT_TYPE,
  PAYMENT_NOTIFICATION_REQUESTED_ROUTING_KEY,
  PaymentNotificationType,
  type PaymentNotificationRequestedV1,
} from '../../../../../../../libs/contracts/src/events/notification-events-v1.event';
import { PersistRequestedNotificationService } from '../../application/services/persist-requested-notification.service';
import { type PersistRequestedNotificationInput } from '../../application/types/persist-requested-notification.types';
import { NotificationOutboxPublisher } from '../../infrastructure/messaging/notification-outbox.publisher';
import {
  PERSISTED_NOTIFICATION_DLQ_ROUTING_KEY,
  PERSISTED_NOTIFICATION_EXCHANGE,
  PERSISTED_NOTIFICATION_MAX_ATTEMPTS,
  PERSISTED_NOTIFICATION_QUEUE_NAME,
  PERSISTED_NOTIFICATION_RETRY_DELAY_MS,
  PERSISTED_NOTIFICATION_RETRY_HEADER,
  PERSISTED_NOTIFICATION_RETRY_ROUTING_KEY,
  PERSISTED_NOTIFICATION_TERMINAL_REASON_HEADER,
} from './persisted-notification-rabbit.constants';

type RabbitMessage = {
  fields?: { redelivered?: boolean; routingKey?: string };
  properties: { headers?: Record<string, unknown>; messageId?: string };
};

type TerminalReason = 'INVALID_EVENT' | 'PERSISTENCE_ERROR';

@Injectable()
export class PersistedPaymentNotificationConsumer {
  private readonly logger = new Logger(PersistedPaymentNotificationConsumer.name);

  constructor(
    private readonly persistence: PersistRequestedNotificationService,
    private readonly outboxPublisher: NotificationOutboxPublisher,
    private readonly amqpConnection: AmqpConnection,
  ) {}

  @RabbitSubscribe({
    exchange: PERSISTED_NOTIFICATION_EXCHANGE,
    routingKey: PAYMENT_NOTIFICATION_REQUESTED_ROUTING_KEY,
    queue: PERSISTED_NOTIFICATION_QUEUE_NAME,
    queueOptions: { durable: true },
  })
  public async handle(
    @RabbitPayload() input: unknown,
    @RabbitRequest() message?: RabbitMessage,
  ): Promise<Nack | void> {
    let normalized: unknown = input;
    try {
      normalized = this.normalize(input);
      const event = this.validate(normalized);
      const result = await this.persistence.execute(event);
      if (result.outboxEventId) {
        try {
          await this.outboxPublisher.publishByEventId(result.outboxEventId);
        } catch (error: unknown) {
          this.logger.warn({
            message: 'Notification outbox immediate publish could not be started',
            eventId: result.outboxEventId,
            errorCode: this.errorCode(error),
          });
        }
      }
      return;
    } catch (error: unknown) {
      if (error instanceof InvalidPersistedNotificationEventError) {
        this.logger.warn({
          message: 'Persisted notification event rejected',
          errorKind: 'INVALID_EVENT',
          ...this.safeContext(normalized, message),
        });
        return this.deadLetter(input, message, 'INVALID_EVENT');
      }
      this.logger.error({
        message: 'Persisted notification transaction failed',
        errorCode: this.errorCode(error),
        ...this.safeContext(normalized, message),
      });
      return this.retryOrDeadLetter(input, message);
    }
  }

  private normalize(input: unknown): unknown {
    if (!Buffer.isBuffer(input) && typeof input !== 'string') return input;
    try {
      return JSON.parse(Buffer.isBuffer(input) ? input.toString('utf8') : input) as unknown;
    } catch {
      throw new InvalidPersistedNotificationEventError();
    }
  }

  private validate(input: unknown): PersistRequestedNotificationInput {
    if (!this.isRecord(input) || !this.isRecord(input.payload)) {
      throw new InvalidPersistedNotificationEventError();
    }
    const payload = input.payload;
    if (
      input.version !== 1 ||
      input.eventType !== PAYMENT_NOTIFICATION_REQUESTED_EVENT_TYPE ||
      input.routingKey !== PAYMENT_NOTIFICATION_REQUESTED_ROUTING_KEY ||
      (input.aggregateType !== 'PAYMENT_TRANSACTION' && input.aggregateType !== 'SUBSCRIPTION') ||
      !this.isUuid(input.eventId) ||
      !this.isUuid(input.aggregateId) ||
      !this.isUtcInstant(input.occurredAt) ||
      !this.isUuid(payload.userId) ||
      !this.isNotificationType(payload.type) ||
      !this.isNonEmptyString(payload.businessKey, 512) ||
      !this.isUtcInstant(payload.effectiveAt)
    ) {
      throw new InvalidPersistedNotificationEventError();
    }
    const subscriptionId = this.nullableUuid(payload.subscriptionId);
    const providerInvoiceId = this.nullableString(payload.providerInvoiceId, 255);
    const subscriptionEndsAt = this.nullableTimestamp(payload.subscriptionEndsAt);
    const reasonCode = this.nullableString(payload.reasonCode, 100);
    this.validateRequiredFields({
      type: payload.type,
      subscriptionId,
      providerInvoiceId,
      subscriptionEndsAt,
      reasonCode,
    });
    return {
      eventId: input.eventId,
      eventType: input.eventType,
      occurredAt: new Date(input.occurredAt),
      type: payload.type,
      userId: payload.userId,
      businessKey: payload.businessKey,
      subscriptionId,
      providerInvoiceId,
      effectiveAt: new Date(payload.effectiveAt),
      subscriptionEndsAt: subscriptionEndsAt ? new Date(subscriptionEndsAt) : null,
      reasonCode,
    };
  }

  private validateRequiredFields(input: {
    type: PaymentNotificationRequestedV1['payload']['type'];
    subscriptionId: string | null;
    providerInvoiceId: string | null;
    subscriptionEndsAt: string | null;
    reasonCode: string | null;
  }): void {
    const subscriptionWithEnd =
      input.type === PaymentNotificationType.SUBSCRIPTION_ACTIVATED ||
      input.type === PaymentNotificationType.SUBSCRIPTION_EXTENDED ||
      input.type === PaymentNotificationType.SUBSCRIPTION_EXPIRING;
    if (subscriptionWithEnd && (!input.subscriptionId || !input.subscriptionEndsAt)) {
      throw new InvalidPersistedNotificationEventError();
    }
    if (input.type === PaymentNotificationType.UPCOMING_PAYMENT && !input.subscriptionId) {
      throw new InvalidPersistedNotificationEventError();
    }
    if (
      (input.type === PaymentNotificationType.PAYMENT_FAILED ||
        input.type === PaymentNotificationType.PAYMENT_RECOVERED) &&
      !input.providerInvoiceId
    ) {
      throw new InvalidPersistedNotificationEventError();
    }
    if (
      input.type === PaymentNotificationType.SUBSCRIPTION_CANCELLED &&
      (!input.subscriptionId || !input.reasonCode)
    ) {
      throw new InvalidPersistedNotificationEventError();
    }
  }

  private async retryOrDeadLetter(
    original: unknown,
    message: RabbitMessage | undefined,
  ): Promise<Nack | void> {
    const nextAttempt = this.retryCount(message) + 1;
    const terminal = nextAttempt >= PERSISTED_NOTIFICATION_MAX_ATTEMPTS;
    try {
      await this.publishConfirmed(
        terminal
          ? PERSISTED_NOTIFICATION_DLQ_ROUTING_KEY
          : PERSISTED_NOTIFICATION_RETRY_ROUTING_KEY,
        original,
        message,
        {
          [PERSISTED_NOTIFICATION_RETRY_HEADER]: nextAttempt,
          ...(terminal
            ? { [PERSISTED_NOTIFICATION_TERMINAL_REASON_HEADER]: 'PERSISTENCE_ERROR' }
            : {}),
        },
      );
      return;
    } catch (error: unknown) {
      return this.delayedRequeue(error, 'Persisted notification retry publication failed');
    }
  }

  private async deadLetter(
    original: unknown,
    message: RabbitMessage | undefined,
    reason: TerminalReason,
  ): Promise<Nack | void> {
    try {
      await this.publishConfirmed(PERSISTED_NOTIFICATION_DLQ_ROUTING_KEY, original, message, {
        [PERSISTED_NOTIFICATION_RETRY_HEADER]: this.retryCount(message),
        [PERSISTED_NOTIFICATION_TERMINAL_REASON_HEADER]: reason,
      });
      return;
    } catch (error: unknown) {
      return this.delayedRequeue(error, 'Persisted notification DLQ publication failed');
    }
  }

  private async publishConfirmed(
    routingKey: string,
    payload: unknown,
    message: RabbitMessage | undefined,
    headers: Record<string, string | number>,
  ): Promise<void> {
    const confirmed = await this.amqpConnection.publish(
      PERSISTED_NOTIFICATION_EXCHANGE,
      routingKey,
      payload,
      {
        persistent: true,
        mandatory: true,
        messageId: this.messageId(payload, message),
        headers,
      },
    );
    if (!confirmed) throw new Error('PERSISTED_NOTIFICATION_PUBLISH_UNCONFIRMED');
  }

  private async delayedRequeue(error: unknown, description: string): Promise<Nack> {
    this.logger.error({ message: description, errorCode: this.errorCode(error) });
    await new Promise<void>((resolve) =>
      setTimeout(resolve, PERSISTED_NOTIFICATION_RETRY_DELAY_MS),
    );
    return new Nack(true);
  }

  private nullableUuid(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    if (!this.isUuid(value)) throw new InvalidPersistedNotificationEventError();
    return value;
  }

  private nullableTimestamp(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    if (!this.isUtcInstant(value)) throw new InvalidPersistedNotificationEventError();
    return value;
  }

  private nullableString(value: unknown, maxLength: number): string | null {
    if (value === undefined || value === null) return null;
    if (!this.isNonEmptyString(value, maxLength))
      throw new InvalidPersistedNotificationEventError();
    return value;
  }

  private isNotificationType(
    value: unknown,
  ): value is PaymentNotificationRequestedV1['payload']['type'] {
    return (
      typeof value === 'string' &&
      Object.values(PaymentNotificationType).includes(value as PaymentNotificationType)
    );
  }

  private isUtcInstant(value: unknown): value is string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
      return false;
    }
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
  }

  private isNonEmptyString(value: unknown, maxLength: number): value is string {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
  }

  private isUuid(value: unknown): value is string {
    return typeof value === 'string' && isUUID(value);
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private retryCount(message: RabbitMessage | undefined): number {
    const value = message?.properties.headers?.[PERSISTED_NOTIFICATION_RETRY_HEADER];
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
  }

  private messageId(input: unknown, message: RabbitMessage | undefined): string | undefined {
    if (typeof message?.properties.messageId === 'string') return message.properties.messageId;
    return this.isRecord(input) && typeof input.eventId === 'string' ? input.eventId : undefined;
  }

  private safeContext(input: unknown, message: RabbitMessage | undefined): Record<string, unknown> {
    const event = this.isRecord(input) ? input : {};
    return {
      ...(typeof event.eventId === 'string' ? { eventId: event.eventId } : {}),
      ...(typeof event.routingKey === 'string' ? { routingKey: event.routingKey } : {}),
      ...(typeof message?.properties.messageId === 'string'
        ? { originalMessageId: message.properties.messageId }
        : {}),
      redelivered: message?.fields?.redelivered === true,
      validationIssue: 'CONTRACT_VALIDATION_FAILED',
    };
  }

  private errorCode(error: unknown): string {
    return error instanceof Error ? error.name : 'UNKNOWN_ERROR';
  }
}

class InvalidPersistedNotificationEventError extends Error {}
