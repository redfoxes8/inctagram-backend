import { Injectable, Logger } from '@nestjs/common';
import { Nack, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
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

type PaymentEntitlementOutcome = 'APPLIED' | 'DUPLICATE' | 'STALE' | 'IGNORED';

const PAYMENT_ACCOUNT_QUEUE_NAME = process.env.PAYMENT_ACCOUNT_QUEUE_NAME;
if (!PAYMENT_ACCOUNT_QUEUE_NAME) {
  throw new Error('PAYMENT_ACCOUNT_QUEUE_NAME is required');
}

@Injectable()
export class PaymentRabbitConsumer {
  private readonly logger = new Logger(PaymentRabbitConsumer.name);

  constructor(private readonly prisma: PrismaService) {}

  @RabbitSubscribe({
    exchange: 'common_exchange',
    routingKey: [SUBSCRIPTION_ACTIVATED_ROUTING_KEY, 'payment.subscription.expired'],
    queue: PAYMENT_ACCOUNT_QUEUE_NAME,
    queueOptions: { durable: true },
  })
  public async handlePaymentEntitlementEvent(input: unknown): Promise<Nack | void> {
    try {
      const event = this.validateEvent(input);
      await this.prisma.$transaction((transaction) => this.process(transaction, event));
    } catch (error: unknown) {
      if (error instanceof InvalidPaymentEventError || error instanceof UserNotFoundError) {
        return new Nack(false);
      }
      this.logger.error('Payment entitlement transaction failed');
      return new Nack(true);
    }
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

    await transaction.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${event.payload.userId}, 0))
    `);
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
      !isUUID(input.eventId, '4') ||
      !isUUID(input.aggregateId, '4') ||
      input.routingKey !== expectedRoutingKey ||
      !this.isSafeTimestamp(input.occurredAt) ||
      !isUUID(payload.userId, '4') ||
      !isUUID(payload.subscriptionId, '4') ||
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
          ? !isUUID(payload.replacementSubscriptionId, '4')
          : payload.replacementSubscriptionId !== null)
      ) {
        throw new InvalidPaymentEventError();
      }
    } else if (
      !this.isSafeTimestamp(payload.startsAt) ||
      !this.isSafeTimestamp(payload.endsAt) ||
      !isUUID(payload.productId, '4')
    ) {
      throw new InvalidPaymentEventError();
    }
    return input as PaymentEntitlementEvent;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
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
