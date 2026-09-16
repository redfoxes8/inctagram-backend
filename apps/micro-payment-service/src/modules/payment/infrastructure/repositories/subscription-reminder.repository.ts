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
  UpdatePendingSubscriptionRemindersInput,
  DueReminderCandidate,
  ClaimedDueReminder,
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

    const created =
      input.slotsToCreate.length === 0
        ? 0
        : (
            await this.prisma.subscriptionReminder.createMany({
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
            })
          ).count;

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
    return { created, updated: updated.length };
  }

  public async suppressPendingForSubscriptions(input: {
    subscriptionIds: string[];
    suppressedAt: Date;
  }): Promise<number> {
    if (input.subscriptionIds.length === 0) return 0;
    const result = await this.prisma.subscriptionReminder.updateMany({
      where: {
        subscriptionId: { in: input.subscriptionIds },
        status: PrismaSubscriptionReminderStatus.PENDING,
      },
      data: {
        status: PrismaSubscriptionReminderStatus.SUPPRESSED,
        suppressedAt: input.suppressedAt,
      },
    });
    return result.count;
  }

  public async updatePendingForSubscription(
    input: UpdatePendingSubscriptionRemindersInput,
  ): Promise<number> {
    const result = await this.prisma.subscriptionReminder.updateMany({
      where: {
        subscriptionId: input.subscriptionId,
        status: PrismaSubscriptionReminderStatus.PENDING,
        OR: [
          { notificationType: { not: this.toPrismaNotificationType(input.notificationType) } },
          { expectedAutoRenew: { not: input.expectedAutoRenew } },
        ],
      },
      data: {
        notificationType: this.toPrismaNotificationType(input.notificationType),
        expectedAutoRenew: input.expectedAutoRenew,
      },
    });
    return result.count;
  }

  public async findDueCandidates(limit: number): Promise<DueReminderCandidate[]> {
    return this.prisma.$queryRaw<DueReminderCandidate[]>(Prisma.sql`
      SELECT "reminder"."id", "reminder"."user_id" AS "userId", transaction_timestamp() AS "now"
      FROM "subscription_reminders" AS "reminder"
      INNER JOIN "subscriptions" AS "subscription"
        ON "subscription"."id" = "reminder"."subscription_id"
      WHERE "reminder"."status" = 'PENDING'::"SubscriptionReminderStatus"
        AND "due_at" <= transaction_timestamp()
        AND "subscription"."status" <> 'QUEUED'::"SubscriptionStatus"
      ORDER BY "reminder"."due_at", "reminder"."id" LIMIT ${limit}
    `);
  }

  public async claimDue(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.$queryRaw<UpdatedReminderRow[]>(Prisma.sql`
      SELECT "id" FROM "subscription_reminders"
      WHERE "id" = ANY(${ids}::uuid[]) AND "status" = 'PENDING'::"SubscriptionReminderStatus"
      FOR UPDATE SKIP LOCKED
    `);
    return rows.map((row) => row.id);
  }

  public async complete(ids: string[], completedAt: Date): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await this.prisma.subscriptionReminder.updateMany({
      where: { id: { in: ids }, status: PrismaSubscriptionReminderStatus.PENDING },
      data: { status: PrismaSubscriptionReminderStatus.COMPLETED, completedAt },
    });
    return result.count;
  }
  public async suppress(ids: string[], suppressedAt: Date): Promise<number> {
    if (!ids.length) return 0;
    const result = await this.prisma.subscriptionReminder.updateMany({
      where: { id: { in: ids }, status: PrismaSubscriptionReminderStatus.PENDING },
      data: { status: PrismaSubscriptionReminderStatus.SUPPRESSED, suppressedAt },
    });
    return result.count;
  }

  public async loadClaimed(ids: string[]): Promise<ClaimedDueReminder[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.$queryRaw<AuthoritativeDueReminderRow[]>(Prisma.sql`
      SELECT reminder."id", reminder."subscription_id" AS "subscriptionId", reminder."user_id" AS "userId", reminder."notification_type" AS "notificationType",
        reminder."lead_days" AS "leadDays", reminder."expected_auto_renew" AS "expectedAutoRenew",
        reminder."subscription_ends_at" AS "subscriptionEndsAt", owner."status" AS "ownerStatus",
        owner."ends_at" AS "ownerEndsAt", owner."auto_renew" AS "ownerAutoRenew",
        EXISTS(SELECT 1 FROM "subscriptions" successor WHERE successor."user_id"=owner."user_id"
          AND successor."status"='QUEUED'::"SubscriptionStatus" AND successor."sequence"=owner."sequence"+1
          AND successor."starts_at"=owner."ends_at" AND successor."ends_at">successor."starts_at") AS "hasSuppressingSuccessor"
      FROM "subscription_reminders" reminder INNER JOIN "subscriptions" owner ON owner."id"=reminder."subscription_id"
      WHERE reminder."id" = ANY(${ids}::uuid[]) AND reminder."status"='PENDING'::"SubscriptionReminderStatus"
    `);
    return rows.map((row) => ({
      id: row.id,
      subscriptionId: row.subscriptionId,
      userId: row.userId,
      notificationType:
        row.notificationType === PrismaSubscriptionReminderNotificationType.UPCOMING_PAYMENT
          ? SubscriptionReminderNotificationType.UPCOMING_PAYMENT
          : SubscriptionReminderNotificationType.SUBSCRIPTION_EXPIRING,
      leadDays: row.leadDays,
      expectedAutoRenew: row.expectedAutoRenew,
      subscriptionEndsAt: row.subscriptionEndsAt,
      ownerStatus: row.ownerStatus,
      ownerEndsAt: row.ownerEndsAt,
      ownerAutoRenew: row.ownerAutoRenew,
      hasSuppressingSuccessor: row.hasSuppressingSuccessor,
    }));
  }

  private toPrismaNotificationType(
    notificationType: SubscriptionReminderNotificationType,
  ): PrismaSubscriptionReminderNotificationType {
    return notificationType === SubscriptionReminderNotificationType.UPCOMING_PAYMENT
      ? PrismaSubscriptionReminderNotificationType.UPCOMING_PAYMENT
      : PrismaSubscriptionReminderNotificationType.SUBSCRIPTION_EXPIRING;
  }
}

type AuthoritativeDueReminderRow = UpdatedReminderRow & {
  notificationType: PrismaSubscriptionReminderNotificationType;
  subscriptionId: string;
  userId: string;
  leadDays: number;
  expectedAutoRenew: boolean;
  subscriptionEndsAt: Date;
  ownerStatus: string;
  ownerEndsAt: Date;
  ownerAutoRenew: boolean;
  hasSuppressingSuccessor: boolean;
};
