import { Controller } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { isUUID } from 'class-validator';
import { DomainException, DomainExceptionCode } from '../../../../../../../libs/common/src';
import {
  PAYMENT_INTEGRATION_AGGREGATE_TYPE,
  SUBSCRIPTION_ACTIVATED_ROUTING_KEY,
  SUBSCRIPTION_AUTO_RENEW_CHANGED_ROUTING_KEY,
  type PaymentIntegrationEventV1,
} from '../../../../../../../libs/contracts/src/events/payment-integration-events-v1.event';
import { NotificationConfig } from '../../../../core/notification.config';
import { NotificationPrismaService } from '../../../../core/prisma/prisma.service';
import { Prisma } from '../../../../core/prisma/client';
import {
  IMailAdapter,
  SendEmailParams,
} from '../../../../application/interfaces/mail-adapter.interface';
import {
  NotificationRecipientContext,
  NotificationRecipientContextPort,
} from '../../application/ports/notification-recipient-context.port';
import { MailTemplates } from '../../../../core/notification.constants';

const PAYMENT_ROUTING_KEYS = [
  'payment.succeeded',
  'payment.failed',
  'subscription.queued',
  SUBSCRIPTION_ACTIVATED_ROUTING_KEY,
  'payment.subscription.expired',
  SUBSCRIPTION_AUTO_RENEW_CHANGED_ROUTING_KEY,
] as const;
const TEMPLATE_VERSION = 1;

type PaymentPurpose =
  | 'PAYMENT_SUCCEEDED'
  | 'PAYMENT_FAILED'
  | 'SUBSCRIPTION_QUEUED'
  | 'SUBSCRIPTION_ACTIVATED'
  | 'SUBSCRIPTION_EXPIRED'
  | 'AUTO_RENEW_CHANGED';

type MappedEvent = {
  event: PaymentIntegrationEventV1;
  purpose: PaymentPurpose;
  template: MailTemplates;
  subject: string;
  skip: boolean;
};
type NotificationTransactionClient = Prisma.TransactionClient;

@Controller()
export class PaymentEventsConsumer {
  constructor(
    private readonly prisma: NotificationPrismaService,
    private readonly config: NotificationConfig,
    private readonly recipientContext: NotificationRecipientContextPort,
    private readonly mailAdapter: IMailAdapter,
  ) {}

  @RabbitSubscribe({
    exchange: 'common_exchange',
    routingKey: [...PAYMENT_ROUTING_KEYS],
    queue: process.env.PAYMENT_NOTIFICATION_QUEUE_NAME || 'payment-notification-queue',
    queueOptions: {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': 'common_exchange',
        'x-dead-letter-routing-key': 'notification.payment.dlq',
      },
    },
  })
  public async handlePaymentEvent(event: unknown): Promise<Nack | void> {
    let mapped: MappedEvent;
    try {
      mapped = this.mapEvent(event);
    } catch {
      return new Nack(false);
    }

    const claimed = await this.prisma.$transaction((transaction) =>
      this.claim(transaction, mapped),
    );
    if (claimed === 'terminal' || claimed === 'processing') return;
    if (mapped.skip) {
      await this.prisma.notificationDelivery.update({
        where: {
          eventId_templateVersion: {
            eventId: mapped.event.eventId,
            templateVersion: TEMPLATE_VERSION,
          },
        },
        data: { status: 'SKIPPED', sentAt: new Date() },
      });
      return;
    }

    try {
      const recipient = await this.recipientContext.getNotificationRecipientContext(
        mapped.event.payload.userId,
      );
      await this.mailAdapter.sendEmail(this.message(mapped, recipient));
      await this.prisma.notificationDelivery.update({
        where: {
          eventId_templateVersion: {
            eventId: mapped.event.eventId,
            templateVersion: TEMPLATE_VERSION,
          },
        },
        data: { status: 'SENT', sentAt: new Date(), lastErrorCode: null },
      });
    } catch (error: unknown) {
      const attempts = await this.markFailed(mapped.event.eventId, error);
      if (this.isTerminal(error) || attempts >= this.config.paymentNotificationMaxAttempts) {
        return new Nack(false);
      }
      await new Promise<void>((resolve) =>
        setTimeout(resolve, this.config.paymentNotificationRetryBackoffMs),
      );
      return new Nack(true);
    }
  }

  private async claim(
    transaction: NotificationTransactionClient,
    event: MappedEvent,
  ): Promise<'claimed' | 'terminal' | 'processing'> {
    const now = new Date();
    const existing = await transaction.notificationDelivery.findUnique({
      where: {
        eventId_templateVersion: {
          eventId: event.event.eventId,
          templateVersion: TEMPLATE_VERSION,
        },
      },
    });
    if (existing?.status === 'SENT' || existing?.status === 'SKIPPED') return 'terminal';
    if (
      existing?.status === 'FAILED' &&
      existing.attempts >= this.config.paymentNotificationMaxAttempts
    ) {
      return 'terminal';
    }
    if (
      existing?.status === 'PROCESSING' &&
      existing.lockedAt &&
      now.getTime() - existing.lockedAt.getTime() <
        this.config.paymentNotificationProcessingTimeoutSeconds * 1000
    ) {
      return 'processing';
    }

    await transaction.notificationDelivery.upsert({
      where: {
        eventId_templateVersion: {
          eventId: event.event.eventId,
          templateVersion: TEMPLATE_VERSION,
        },
      },
      create: {
        eventId: event.event.eventId,
        eventType: event.event.eventType,
        routingKey: event.event.routingKey,
        templatePurpose: event.purpose,
        templateVersion: TEMPLATE_VERSION,
        userId: event.event.payload.userId,
        status: 'PROCESSING',
        attempts: 1,
        lockedAt: now,
        processingStartedAt: now,
      },
      update: {
        status: 'PROCESSING',
        attempts: { increment: 1 },
        lockedAt: now,
        processingStartedAt: now,
        availableAt: now,
      },
    });
    return 'claimed';
  }

  private async markFailed(eventId: string, error: unknown): Promise<number> {
    const record = await this.prisma.notificationDelivery.update({
      where: { eventId_templateVersion: { eventId, templateVersion: TEMPLATE_VERSION } },
      data: { status: 'FAILED', lastErrorCode: this.errorCode(error) },
    });
    return record.attempts;
  }

  private mapEvent(input: unknown): MappedEvent {
    if (!this.isRecord(input) || input.version !== 1 || !isUUID(input.eventId, '4')) {
      throw new InvalidPaymentEventError();
    }
    const event = input as PaymentIntegrationEventV1;
    const byKey: Record<string, Omit<MappedEvent, 'event'>> = {
      'payment.succeeded': {
        purpose: 'PAYMENT_SUCCEEDED',
        template: MailTemplates.PaymentSucceeded,
        subject: 'Payment succeeded',
        skip: false,
      },
      'payment.failed': {
        purpose: 'PAYMENT_FAILED',
        template: MailTemplates.PaymentFailed,
        subject: 'Payment failed',
        skip: false,
      },
      'subscription.queued': {
        purpose: 'SUBSCRIPTION_QUEUED',
        template: MailTemplates.SubscriptionQueued,
        subject: 'Subscription period queued',
        skip: false,
      },
      [SUBSCRIPTION_ACTIVATED_ROUTING_KEY]: {
        purpose: 'SUBSCRIPTION_ACTIVATED',
        template: MailTemplates.SubscriptionActivated,
        subject: 'Subscription activated',
        skip: false,
      },
      'payment.subscription.expired': {
        purpose: 'SUBSCRIPTION_EXPIRED',
        template: MailTemplates.SubscriptionExpired,
        subject: 'Subscription expired',
        skip: this.isRecord(input.payload) && input.payload.hasActiveReplacement === true,
      },
      [SUBSCRIPTION_AUTO_RENEW_CHANGED_ROUTING_KEY]: {
        purpose: 'AUTO_RENEW_CHANGED',
        template: MailTemplates.AutoRenewChanged,
        subject: 'Auto-renew preference updated',
        skip: false,
      },
    };
    const mapping = byKey[event.routingKey];
    if (!mapping || !this.validEnvelope(event)) throw new InvalidPaymentEventError();
    return { event, ...mapping };
  }

  private validEnvelope(event: PaymentIntegrationEventV1): boolean {
    if (!PAYMENT_ROUTING_KEYS.includes(event.routingKey)) return false;
    const expectedEventTypes: Record<string, string> = {
      'payment.succeeded': 'payment.succeeded.v1',
      'payment.failed': 'payment.failed.v1',
      'subscription.queued': 'subscription.queued.v1',
      [SUBSCRIPTION_ACTIVATED_ROUTING_KEY]: 'subscription.activated.v1',
      'payment.subscription.expired': 'subscription.expired.v1',
      [SUBSCRIPTION_AUTO_RENEW_CHANGED_ROUTING_KEY]: 'subscription.auto-renew.changed.v1',
    };
    if (event.eventType !== expectedEventTypes[event.routingKey]) return false;
    if (!isUUID(event.aggregateId, '4') || !this.isRecord(event.payload)) return false;
    if (!isUUID(event.payload.userId, '4')) return false;
    if (event.aggregateType === PAYMENT_INTEGRATION_AGGREGATE_TYPE.SUBSCRIPTION) {
      return isUUID(event.payload.subscriptionId, '4');
    }
    return (
      event.aggregateType === PAYMENT_INTEGRATION_AGGREGATE_TYPE.PAYMENT_TRANSACTION &&
      (event.routingKey === 'payment.succeeded' || event.routingKey === 'payment.failed')
    );
  }

  private message(event: MappedEvent, recipient: NotificationRecipientContext): SendEmailParams {
    const payload = event.event.payload as Record<string, unknown>;
    return {
      to: recipient.email,
      subject: event.subject,
      template: event.template,
      context: {
        userName: recipient.userName,
        username: recipient.userName,
        subscriptionId: payload.subscriptionId,
        amountMinor: payload.amountMinor,
        currency: payload.currency,
        provider: payload.provider,
        enabled: payload.enabled,
      },
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private isTerminal(error: unknown): boolean {
    return (
      error instanceof DomainException &&
      (error.code === DomainExceptionCode.NotFound || error.code === DomainExceptionCode.BadRequest)
    );
  }

  private errorCode(error: unknown): string {
    if (error instanceof DomainException) return `DOMAIN_${error.code}`;
    if (error instanceof Error) return error.name;
    return 'UNKNOWN_ERROR';
  }
}

class InvalidPaymentEventError extends Error {}
