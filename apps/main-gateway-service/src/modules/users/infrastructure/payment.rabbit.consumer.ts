import { Injectable, Logger } from '@nestjs/common';
import {
  AmqpConnection,
  Nack,
  RabbitPayload,
  RabbitRequest,
  RabbitSubscribe,
} from '@golevelup/nestjs-rabbitmq';
import { isUUID } from 'class-validator';
import { Prisma, AccountType } from '../../../core/prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import {
  PAYMENT_INTEGRATION_AGGREGATE_TYPE,
  PAYMENT_INTEGRATION_EVENT_TYPE,
  SUBSCRIPTION_ACTIVATED_ROUTING_KEY,
  type SubscriptionActivatedV1,
  type SubscriptionExpiredV1,
} from '../../../../../../libs/contracts/src/events/payment-integration-events-v1.event';

type PaymentEntitlementEvent = SubscriptionActivatedV1 | SubscriptionExpiredV1;
type TransactionClient = Prisma.TransactionClient;
type PaymentRabbitMessage = {
  fields?: { redelivered?: boolean; routingKey?: string };
  properties: { headers?: Record<string, unknown>; messageId?: string };
};

type PaymentPublishOptions = {
  persistent: true;
  mandatory: true;
  messageId?: string;
  expiration?: number;
  headers: Record<string, unknown>;
};

type TerminalEntitlementReason = 'INVALID_EVENT' | 'USER_NOT_FOUND';

type PaymentEntitlementOutcome = 'APPLIED' | 'DUPLICATE' | 'STALE' | 'IGNORED';
type SafePaymentEntitlementError = {
  name?: string;
  code?: string;
  meta?: {
    modelName?: string;
    fieldName?: string;
    target?: string | string[];
  };
  cause?: {
    name?: string;
    code?: string;
  };
};

const PAYMENT_ACCOUNT_QUEUE_NAME = process.env.PAYMENT_ACCOUNT_QUEUE_NAME;
if (!PAYMENT_ACCOUNT_QUEUE_NAME) {
  throw new Error('PAYMENT_ACCOUNT_QUEUE_NAME is required');
}

export const PAYMENT_ENTITLEMENT_RETRY_DELAY_ROUTING_KEY =
  'gateway.payment-entitlement.retry.delay';
export const PAYMENT_ENTITLEMENT_RETRY_READY_ROUTING_KEY =
  'gateway.payment-entitlement.retry.ready';
export const PAYMENT_ENTITLEMENT_DLQ_ROUTING_KEY = 'gateway.payment-entitlement.dlq';
export const PAYMENT_ENTITLEMENT_RETRY_QUEUE_NAME = `${PAYMENT_ACCOUNT_QUEUE_NAME}.retry`;
export const PAYMENT_ENTITLEMENT_DLQ_NAME = `${PAYMENT_ACCOUNT_QUEUE_NAME}.dlq`;
const PAYMENT_ENTITLEMENT_RETRY_HEADER = 'x-payment-entitlement-retry-count';
const PAYMENT_ENTITLEMENT_TERMINAL_REASON_HEADER = 'x-payment-entitlement-terminal-reason';
const PAYMENT_ENTITLEMENT_ORIGINAL_ROUTING_KEY_HEADER = 'x-original-routing-key';
const PAYMENT_ENTITLEMENT_REDELIVERED_HEADER = 'x-original-redelivered';
const PAYMENT_ENTITLEMENT_RETRY_DELAY_MS = 5 * 60 * 1_000;
const PAYMENT_ENTITLEMENT_MAX_ATTEMPTS = 3;

@Injectable()
export class PaymentRabbitConsumer {
  private readonly logger = new Logger(PaymentRabbitConsumer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly amqpConnection: AmqpConnection,
  ) {}

  @RabbitSubscribe({
    exchange: 'common_exchange',
    routingKey: [
      SUBSCRIPTION_ACTIVATED_ROUTING_KEY,
      'payment.subscription.expired',
      PAYMENT_ENTITLEMENT_RETRY_READY_ROUTING_KEY,
    ],
    queue: PAYMENT_ACCOUNT_QUEUE_NAME,
    queueOptions: { durable: true },
  })
  public async handlePaymentEntitlementEvent(
    @RabbitPayload() input: unknown,
    @RabbitRequest() message?: PaymentRabbitMessage,
  ): Promise<Nack | void> {
    let normalizedInput = input;
    try {
      normalizedInput = this.normalizeInput(input);
      const event = this.validateEvent(normalizedInput);
      await this.prisma.$transaction((transaction) => this.process(transaction, event));
    } catch (error: unknown) {
      if (error instanceof InvalidPaymentEventError) {
        this.logger.warn({
          message: 'Payment entitlement event rejected',
          errorKind: 'INVALID_EVENT',
          ...this.safeEventContext(normalizedInput, message),
          validationIssue: 'CONTRACT_VALIDATION_FAILED',
        });
        return this.deadLetterTerminal(input, normalizedInput, message, 'INVALID_EVENT');
      }
      if (error instanceof UserNotFoundError) {
        this.logger.warn({
          message: 'Payment entitlement event rejected',
          errorKind: 'USER_NOT_FOUND',
          ...this.safeEventContext(normalizedInput, message),
          validationIssue: 'USER_NOT_FOUND',
        });
        return this.deadLetterTerminal(input, normalizedInput, message, 'USER_NOT_FOUND');
      }
      this.logger.error({
        message: 'Payment entitlement transaction failed',
        error: this.safeError(error),
      });
      return this.retryOrDeadLetter(input, message);
    }
  }

  private normalizeInput(input: unknown): unknown {
    if (!Buffer.isBuffer(input) && typeof input !== 'string') return input;

    try {
      const serialized = Buffer.isBuffer(input) ? input.toString('utf8') : input;
      const parsed: unknown = JSON.parse(serialized);
      return parsed;
    } catch {
      throw new InvalidPaymentEventError();
    }
  }

  private async retryOrDeadLetter(
    input: unknown,
    message: PaymentRabbitMessage | undefined,
  ): Promise<Nack | void> {
    const retryCount = this.retryCount(message);
    const nextAttempt = retryCount + 1;
    const terminal = nextAttempt >= PAYMENT_ENTITLEMENT_MAX_ATTEMPTS;
    try {
      await this.publishConfirmed(
        terminal
          ? PAYMENT_ENTITLEMENT_DLQ_ROUTING_KEY
          : PAYMENT_ENTITLEMENT_RETRY_DELAY_ROUTING_KEY,
        input,
        {
          persistent: true,
          mandatory: true,
          messageId: this.messageId(input, message),
          ...(terminal ? {} : { expiration: PAYMENT_ENTITLEMENT_RETRY_DELAY_MS }),
          headers: { [PAYMENT_ENTITLEMENT_RETRY_HEADER]: nextAttempt },
        },
      );
      this.logger.warn({
        message: terminal
          ? 'Payment entitlement event moved to DLQ after bounded retries'
          : 'Payment entitlement event scheduled for delayed retry',
        attempt: nextAttempt,
      });
      return;
    } catch (error: unknown) {
      return this.delayedRequeue(error, 'Payment entitlement retry publication failed');
    }
  }

  private async deadLetterTerminal(
    originalInput: unknown,
    normalizedInput: unknown,
    message: PaymentRabbitMessage | undefined,
    reason: TerminalEntitlementReason,
  ): Promise<Nack | void> {
    const retryCount = this.retryCount(message);
    const context = this.safeEventContext(normalizedInput, message);
    const originalRoutingKey =
      typeof context.routingKey === 'string' ? context.routingKey : message?.fields?.routingKey;

    try {
      await this.publishConfirmed(PAYMENT_ENTITLEMENT_DLQ_ROUTING_KEY, originalInput, {
        persistent: true,
        mandatory: true,
        messageId: this.messageId(normalizedInput, message),
        headers: {
          [PAYMENT_ENTITLEMENT_RETRY_HEADER]: retryCount,
          [PAYMENT_ENTITLEMENT_TERMINAL_REASON_HEADER]: reason,
          ...(originalRoutingKey
            ? { [PAYMENT_ENTITLEMENT_ORIGINAL_ROUTING_KEY_HEADER]: originalRoutingKey }
            : {}),
          [PAYMENT_ENTITLEMENT_REDELIVERED_HEADER]: message?.fields?.redelivered === true,
        },
      });
      this.logger.warn({
        message: 'Payment entitlement terminal event moved to DLQ',
        errorKind: reason,
        ...context,
      });
      return;
    } catch (error: unknown) {
      return this.delayedRequeue(error, 'Payment entitlement terminal DLQ publication failed');
    }
  }

  private async publishConfirmed(
    routingKey: string,
    input: unknown,
    options: PaymentPublishOptions,
  ): Promise<void> {
    const published = await this.amqpConnection.publish(
      'common_exchange',
      routingKey,
      input,
      options,
    );
    if (!published) {
      throw new Error('RabbitMQ did not confirm entitlement publication');
    }
  }

  private async delayedRequeue(error: unknown, message: string): Promise<Nack> {
    this.logger.error({ message, error: this.safeError(error) });
    await new Promise<void>((resolve) => setTimeout(resolve, PAYMENT_ENTITLEMENT_RETRY_DELAY_MS));
    return new Nack(true);
  }

  private retryCount(message: PaymentRabbitMessage | undefined): number {
    const value = message?.properties.headers?.[PAYMENT_ENTITLEMENT_RETRY_HEADER];
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
  }

  private messageId(input: unknown, message: PaymentRabbitMessage | undefined): string | undefined {
    if (typeof message?.properties.messageId === 'string') return message.properties.messageId;
    if (typeof input !== 'object' || input === null || !('eventId' in input)) return undefined;
    return typeof input.eventId === 'string' ? input.eventId : undefined;
  }

  private safeEventContext(
    input: unknown,
    message: PaymentRabbitMessage | undefined,
  ): Record<string, unknown> {
    const event = this.isRecord(input) ? input : {};
    const payload = this.isRecord(event.payload) ? event.payload : {};
    return {
      ...(typeof event.eventId === 'string' ? { eventId: event.eventId } : {}),
      ...(typeof payload.userId === 'string' ? { userId: payload.userId } : {}),
      ...(typeof event.routingKey === 'string' ? { routingKey: event.routingKey } : {}),
      redelivered: message?.fields?.redelivered === true,
    };
  }

  private async process(
    transaction: TransactionClient,
    event: PaymentEntitlementEvent,
  ): Promise<void> {
    const existing = await transaction.paymentEntitlementInbox.findUnique({
      where: { eventId: event.eventId },
    });
    if (existing) return;

    await transaction.paymentEntitlementInbox.create({
      data: {
        eventId: event.eventId,
        eventType: event.eventType,
        userId: event.payload.userId,
        subscriptionId: event.payload.subscriptionId,
        subscriptionSequence: event.payload.subscriptionSequence,
        outcome: 'IGNORED',
      },
    });

    await transaction.$queryRaw`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${event.payload.userId}::text, 0::bigint)
      ) IS NULL AS "locked"
    `;
    const user = await transaction.user.findFirst({
      where: { id: event.payload.userId, deletedAt: null },
    });
    if (!user) throw new UserNotFoundError();

    const cursor = await transaction.paymentEntitlementCursor.findUnique({
      where: { userId: event.payload.userId },
    });
    const lastSequence = cursor?.lastSubscriptionSequence ?? 0;
    let outcome: PaymentEntitlementOutcome;
    let activeSubscriptionId = cursor?.activeSubscriptionId ?? null;
    let nextSequence = lastSequence;

    if (event.eventType === PAYMENT_INTEGRATION_EVENT_TYPE.SUBSCRIPTION_ACTIVATED) {
      if (event.payload.subscriptionSequence < lastSequence) {
        outcome = 'STALE';
      } else if (
        event.payload.subscriptionSequence === lastSequence &&
        activeSubscriptionId === event.payload.subscriptionId
      ) {
        outcome = 'IGNORED';
      } else if (event.payload.subscriptionSequence === lastSequence) {
        outcome = 'STALE';
      } else {
        await transaction.user.update({
          where: { id: event.payload.userId },
          data: { accountType: AccountType.BUSINESS, updatedAt: new Date() },
        });
        nextSequence = event.payload.subscriptionSequence;
        activeSubscriptionId = event.payload.subscriptionId;
        outcome = 'APPLIED';
      }
    } else if (event.payload.subscriptionSequence < lastSequence) {
      outcome = 'STALE';
    } else if (event.payload.hasActiveReplacement) {
      if (event.payload.subscriptionSequence > lastSequence) {
        nextSequence = event.payload.subscriptionSequence;
        activeSubscriptionId = event.payload.replacementSubscriptionId;
      }
      outcome = 'APPLIED';
    } else {
      await transaction.user.update({
        where: { id: event.payload.userId },
        data: { accountType: AccountType.PERSONAL, updatedAt: new Date() },
      });
      nextSequence = event.payload.subscriptionSequence;
      activeSubscriptionId = null;
      outcome = 'APPLIED';
    }

    await transaction.paymentEntitlementCursor.upsert({
      where: { userId: event.payload.userId },
      create: {
        userId: event.payload.userId,
        lastSubscriptionSequence: nextSequence,
        activeSubscriptionId,
      },
      update: {
        lastSubscriptionSequence: nextSequence,
        activeSubscriptionId,
        updatedAt: new Date(),
      },
    });
    await transaction.paymentEntitlementInbox.update({
      where: { eventId: event.eventId },
      data: { outcome, processedAt: new Date() },
    });
  }

  private validateEvent(input: unknown): PaymentEntitlementEvent {
    if (
      !this.isRecord(input) ||
      input.version !== 1 ||
      (input.eventType !== PAYMENT_INTEGRATION_EVENT_TYPE.SUBSCRIPTION_ACTIVATED &&
        input.eventType !== PAYMENT_INTEGRATION_EVENT_TYPE.SUBSCRIPTION_EXPIRED)
    ) {
      throw new InvalidPaymentEventError();
    }
    const expectedEventType = input.eventType;
    const expectedRoutingKey =
      expectedEventType === PAYMENT_INTEGRATION_EVENT_TYPE.SUBSCRIPTION_ACTIVATED
        ? SUBSCRIPTION_ACTIVATED_ROUTING_KEY
        : 'payment.subscription.expired';
    const payload = input.payload;
    if (!this.isRecord(payload)) throw new InvalidPaymentEventError();
    if (
      input.aggregateType !== PAYMENT_INTEGRATION_AGGREGATE_TYPE.SUBSCRIPTION ||
      !isUUID(input.eventId) ||
      !isUUID(input.aggregateId) ||
      input.routingKey !== expectedRoutingKey ||
      !this.isSafeTimestamp(input.occurredAt) ||
      !isUUID(payload.userId) ||
      !isUUID(payload.subscriptionId) ||
      typeof payload.subscriptionSequence !== 'number' ||
      !Number.isSafeInteger(payload.subscriptionSequence) ||
      payload.subscriptionSequence <= 0
    ) {
      throw new InvalidPaymentEventError();
    }
    if (expectedEventType === PAYMENT_INTEGRATION_EVENT_TYPE.SUBSCRIPTION_EXPIRED) {
      if (
        typeof payload.hasActiveReplacement !== 'boolean' ||
        (payload.hasActiveReplacement
          ? !isUUID(payload.replacementSubscriptionId)
          : payload.replacementSubscriptionId !== null)
      ) {
        throw new InvalidPaymentEventError();
      }
    } else if (
      !this.isSafeTimestamp(payload.startsAt) ||
      !this.isSafeTimestamp(payload.endsAt) ||
      !isUUID(payload.productId)
    ) {
      throw new InvalidPaymentEventError();
    }
    return input as PaymentEntitlementEvent;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private safeError(error: unknown): SafePaymentEntitlementError {
    if (!this.isRecord(error)) return {};

    const meta = this.isRecord(error.meta) ? error.meta : undefined;
    const cause = this.isRecord(error.cause) ? error.cause : undefined;
    const target = meta?.target;

    return {
      ...(typeof error.name === 'string' ? { name: error.name } : {}),
      ...(typeof error.code === 'string' ? { code: error.code } : {}),
      ...(meta
        ? {
            meta: {
              ...(typeof meta.modelName === 'string' ? { modelName: meta.modelName } : {}),
              ...(typeof meta.field_name === 'string' ? { fieldName: meta.field_name } : {}),
              ...(typeof target === 'string' ||
              (Array.isArray(target) && target.every((value) => typeof value === 'string'))
                ? { target }
                : {}),
            },
          }
        : {}),
      ...(cause
        ? {
            cause: {
              ...(typeof cause.name === 'string' ? { name: cause.name } : {}),
              ...(typeof cause.code === 'string' ? { code: cause.code } : {}),
            },
          }
        : {}),
    };
  }

  private isSafeTimestamp(value: unknown): value is string {
    return (
      typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
      !Number.isNaN(Date.parse(value))
    );
  }
}

class InvalidPaymentEventError extends Error {}
class UserNotFoundError extends Error {}
