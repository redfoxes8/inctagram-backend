import { Inject, Injectable } from '@nestjs/common';

import {
  Prisma,
  SubscriptionReminderNotificationType as PrismaSubscriptionReminderNotificationType,
  SubscriptionReminderStatus as PrismaSubscriptionReminderStatus,
} from '../../../../core/prisma/client';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { SubscriptionReminderNotificationType } from '../../domain/enums/subscription-reminder-notification-type.enum';
import {
  ISubscriptionReminderRepository,
  ReconcileSubscriptionReminderSlotsInput,
  SubscriptionReminderReconciliationResult,
} from '../../domain/interfaces/subscription-reminder.repository.interface';
import type { PaymentPrismaClient } from './payment-prisma-client.type';

type UpdatedReminderRow = Readonly<{ id: string }>;

@Injectable()
export class SubscriptionReminderRepository implements ISubscriptionReminderRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PaymentPrismaClient) {}

  public static forTransaction(transaction: PaymentPrismaClient): SubscriptionReminderRepository {
    return new SubscriptionReminderRepository(transaction);
  }

  public async reconcile(
    input: ReconcileSubscriptionReminderSlotsInput,
  ): Promise<SubscriptionReminderReconciliationResult> {
    if (input.desiredSlots.length === 0) return { created: 0, updated: 0 };

    const created = await this.prisma.subscriptionReminder.createMany({
      data: input.slotsToCreate.map((slot) => ({
        subscriptionId: slot.subscriptionId,
        userId: slot.userId,
        notificationType: this.toPrismaNotificationType(slot.notificationType),
        leadDays: slot.leadDays,
        dueAt: slot.dueAt,
        subscriptionEndsAt: slot.subscriptionEndsAt,
        expectedAutoRenew: slot.expectedAutoRenew,
      })),
      skipDuplicates: true,
    });

    const desiredSlots = JSON.stringify(
      input.desiredSlots.map((slot) => ({
        subscriptionId: slot.subscriptionId,
        subscriptionEndsAt: slot.subscriptionEndsAt.toISOString(),
        leadDays: slot.leadDays,
        notificationType: slot.notificationType,
        expectedAutoRenew: slot.expectedAutoRenew,
      })),
    );
    const updated = await this.prisma.$queryRaw<UpdatedReminderRow[]>(Prisma.sql`
      WITH "desired" AS (
        SELECT *
        FROM jsonb_to_recordset(${desiredSlots}::jsonb) AS "input"(
          "subscriptionId" uuid,
          "subscriptionEndsAt" timestamptz,
          "leadDays" smallint,
          "notificationType" "SubscriptionReminderNotificationType",
          "expectedAutoRenew" boolean
        )
      )
      UPDATE "subscription_reminders" AS "reminder"
      SET
        "notification_type" = "desired"."notificationType",
        "expected_auto_renew" = "desired"."expectedAutoRenew",
        "updated_at" = CURRENT_TIMESTAMP
      FROM "desired"
      WHERE "reminder"."subscription_id" = "desired"."subscriptionId"
        AND "reminder"."subscription_ends_at" = "desired"."subscriptionEndsAt"
        AND "reminder"."lead_days" = "desired"."leadDays"
        AND "reminder"."status" = 'PENDING'::"SubscriptionReminderStatus"
        AND (
          "reminder"."notification_type" IS DISTINCT FROM "desired"."notificationType"
          OR "reminder"."expected_auto_renew" IS DISTINCT FROM "desired"."expectedAutoRenew"
        )
      RETURNING "reminder"."id"
    `);
    return { created: created.count, updated: updated.length };
  }

  public async suppressPendingForSubscription(input: {
    subscriptionId: string;
    suppressedAt: Date;
  }): Promise<number> {
    const result = await this.prisma.subscriptionReminder.updateMany({
      where: {
        subscriptionId: input.subscriptionId,
        status: PrismaSubscriptionReminderStatus.PENDING,
      },
      data: {
        status: PrismaSubscriptionReminderStatus.SUPPRESSED,
        suppressedAt: input.suppressedAt,
      },
    });
    return result.count;
  }

  private toPrismaNotificationType(
    notificationType: SubscriptionReminderNotificationType,
  ): PrismaSubscriptionReminderNotificationType {
    return notificationType === SubscriptionReminderNotificationType.UPCOMING_PAYMENT
      ? PrismaSubscriptionReminderNotificationType.UPCOMING_PAYMENT
      : PrismaSubscriptionReminderNotificationType.SUBSCRIPTION_EXPIRING;
  }
}
