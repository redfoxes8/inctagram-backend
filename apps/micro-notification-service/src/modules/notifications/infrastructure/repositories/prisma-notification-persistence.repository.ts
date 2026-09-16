import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  NOTIFICATION_CREATED_EVENT_TYPE,
  NOTIFICATION_CREATED_ROUTING_KEY,
  NOTIFICATION_EVENT_VERSION,
  type NotificationCreatedV1,
  type NotificationItemV1,
  type PaymentNotificationType,
} from '../../../../../../../libs/contracts/src/events/notification-events-v1.event';
import { NotificationPrismaService } from '../../../../core/prisma/prisma.service';
import {
  NotificationInboxOutcome,
  NotificationOutboxStatus,
  NotificationType as PrismaNotificationType,
  Prisma,
  type Notification,
} from '../../../../core/prisma/client';
import { INotificationPersistencePort } from '../../application/ports/notification-persistence.port';
import {
  PersistRequestedNotificationOutcome,
  type PersistRequestedNotificationInput,
  type PersistRequestedNotificationResult,
} from '../../application/types/persist-requested-notification.types';

type NotificationPersistenceTransaction = Prisma.TransactionClient;

@Injectable()
export class PrismaNotificationPersistenceRepository extends INotificationPersistencePort {
  constructor(private readonly prisma: NotificationPrismaService) {
    super();
  }

  public async persist(
    input: PersistRequestedNotificationInput,
  ): Promise<PersistRequestedNotificationResult> {
    return this.prisma.$transaction((transaction) => this.persistInTransaction(transaction, input));
  }

  private async persistInTransaction(
    transaction: NotificationPersistenceTransaction,
    input: PersistRequestedNotificationInput,
  ): Promise<PersistRequestedNotificationResult> {
    const existingInbox = await transaction.notificationInbox.findUnique({
      where: { eventId: input.eventId },
      select: { notificationId: true },
    });
    if (existingInbox) {
      return {
        outcome: PersistRequestedNotificationOutcome.DUPLICATE_EVENT,
        notificationId: this.requireNotificationId(existingInbox.notificationId),
        outboxEventId: await this.findRecoverableOutboxEventId(
          transaction,
          this.requireNotificationId(existingInbox.notificationId),
        ),
      };
    }

    const existingNotification = await transaction.notification.findUnique({
      where: { businessKey: input.businessKey },
    });
    if (existingNotification) {
      return this.persistBusinessDuplicate(transaction, input, existingNotification.id);
    }

    const notification = await transaction.notification.upsert({
      where: { businessKey: input.businessKey },
      create: {
        userId: input.userId,
        type: this.toPrismaNotificationType(input.type),
        businessKey: input.businessKey,
        subscriptionId: input.subscriptionId,
        providerInvoiceId: input.providerInvoiceId,
        effectiveAt: input.effectiveAt,
        subscriptionEndsAt: input.subscriptionEndsAt,
        reasonCode: input.reasonCode,
        seenAt: null,
      },
      update: {},
    });

    const unseenCount = await transaction.notification.count({
      where: { userId: notification.userId, seenAt: null },
    });
    const createdEvent = this.createdEvent({ notification, unseenCount });
    const outbox = await transaction.notificationOutbox.createMany({
      data: {
        eventId: createdEvent.eventId,
        aggregateId: notification.id,
        eventType: createdEvent.eventType,
        eventVersion: createdEvent.version,
        routingKey: createdEvent.routingKey,
        payload: createdEvent as Prisma.InputJsonValue,
        occurredAt: notification.createdAt,
      },
      skipDuplicates: true,
    });
    const outcome =
      outbox.count === 1
        ? PersistRequestedNotificationOutcome.APPLIED
        : PersistRequestedNotificationOutcome.DUPLICATE_BUSINESS_KEY;
    const inbox = await transaction.notificationInbox.createMany({
      data: {
        eventId: input.eventId,
        eventType: input.eventType,
        businessKey: input.businessKey,
        outcome:
          outcome === PersistRequestedNotificationOutcome.APPLIED
            ? NotificationInboxOutcome.APPLIED
            : NotificationInboxOutcome.DUPLICATE,
        notificationId: notification.id,
      },
      skipDuplicates: true,
    });
    if (inbox.count === 0) {
      return {
        outcome: PersistRequestedNotificationOutcome.DUPLICATE_EVENT,
        notificationId: notification.id,
        outboxEventId: await this.findRecoverableOutboxEventId(transaction, notification.id),
      };
    }

    return {
      outcome,
      notificationId: notification.id,
      outboxEventId:
        outcome === PersistRequestedNotificationOutcome.APPLIED
          ? createdEvent.eventId
          : await this.findRecoverableOutboxEventId(transaction, notification.id),
    };
  }

  private async persistBusinessDuplicate(
    transaction: NotificationPersistenceTransaction,
    input: PersistRequestedNotificationInput,
    notificationId: string,
  ): Promise<PersistRequestedNotificationResult> {
    const inbox = await transaction.notificationInbox.createMany({
      data: {
        eventId: input.eventId,
        eventType: input.eventType,
        businessKey: input.businessKey,
        outcome: NotificationInboxOutcome.DUPLICATE,
        notificationId,
      },
      skipDuplicates: true,
    });
    if (inbox.count === 0) {
      return {
        outcome: PersistRequestedNotificationOutcome.DUPLICATE_EVENT,
        notificationId,
        outboxEventId: await this.findRecoverableOutboxEventId(transaction, notificationId),
      };
    }
    return {
      outcome: PersistRequestedNotificationOutcome.DUPLICATE_BUSINESS_KEY,
      notificationId,
      outboxEventId: await this.findRecoverableOutboxEventId(transaction, notificationId),
    };
  }

  private async findRecoverableOutboxEventId(
    transaction: NotificationPersistenceTransaction,
    notificationId: string,
  ): Promise<string | null> {
    const outbox = await transaction.notificationOutbox.findFirst({
      where: {
        aggregateId: notificationId,
        status: { in: [NotificationOutboxStatus.PENDING, NotificationOutboxStatus.FAILED] },
      },
      select: { eventId: true },
    });
    return outbox?.eventId ?? null;
  }

  private createdEvent(input: {
    notification: Notification;
    unseenCount: number;
  }): NotificationCreatedV1 {
    const { notification, unseenCount } = input;
    const eventId = randomUUID();
    const occurredAt = notification.createdAt.toISOString();
    return {
      eventId,
      version: NOTIFICATION_EVENT_VERSION,
      eventType: NOTIFICATION_CREATED_EVENT_TYPE,
      occurredAt,
      aggregateType: 'NOTIFICATION',
      aggregateId: notification.id,
      routingKey: NOTIFICATION_CREATED_ROUTING_KEY,
      payload: {
        userId: notification.userId,
        notification: this.notificationItem(notification),
        unseenCount,
      },
    };
  }

  private notificationItem(notification: Notification): NotificationItemV1 {
    return {
      id: notification.id,
      type: notification.type,
      subscriptionId: notification.subscriptionId,
      providerInvoiceId: notification.providerInvoiceId,
      effectiveAt: notification.effectiveAt.toISOString(),
      subscriptionEndsAt: notification.subscriptionEndsAt?.toISOString() ?? null,
      reasonCode: notification.reasonCode,
      createdAt: notification.createdAt.toISOString(),
      seenAt: notification.seenAt?.toISOString() ?? null,
    };
  }

  private requireNotificationId(notificationId: string | null): string {
    if (notificationId) return notificationId;
    throw new Error('NOTIFICATION_INBOX_NOTIFICATION_REFERENCE_MISSING');
  }

  private toPrismaNotificationType(value: PaymentNotificationType): PrismaNotificationType {
    const types: Readonly<Record<PaymentNotificationType, PrismaNotificationType>> = {
      SUBSCRIPTION_ACTIVATED: PrismaNotificationType.SUBSCRIPTION_ACTIVATED,
      SUBSCRIPTION_EXTENDED: PrismaNotificationType.SUBSCRIPTION_EXTENDED,
      UPCOMING_PAYMENT: PrismaNotificationType.UPCOMING_PAYMENT,
      SUBSCRIPTION_EXPIRING: PrismaNotificationType.SUBSCRIPTION_EXPIRING,
      PAYMENT_FAILED: PrismaNotificationType.PAYMENT_FAILED,
      PAYMENT_RECOVERED: PrismaNotificationType.PAYMENT_RECOVERED,
      SUBSCRIPTION_CANCELLED: PrismaNotificationType.SUBSCRIPTION_CANCELLED,
    };
    return types[value];
  }
}
