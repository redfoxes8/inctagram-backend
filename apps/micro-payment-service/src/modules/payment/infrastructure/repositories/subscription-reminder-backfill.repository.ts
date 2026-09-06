import { Injectable } from '@nestjs/common';
import { SubscriptionStatus as PrismaSubscriptionStatus } from '../../../../core/prisma/client';
import { SubscriptionStatus } from '../../domain/enums/subscription-status.enum';
import {
  ISubscriptionReminderBackfillRepository,
  SubscriptionReminderBackfillCandidate,
  SubscriptionReminderBackfillCursor,
  SubscriptionReminderBackfillPeriod,
} from '../../domain/interfaces/subscription-reminder-backfill.repository.interface';
import { PaymentPrismaMapper } from '../mappers/payment-prisma.mapper';
import type { PaymentPrismaClient } from './payment-prisma-client.type';

@Injectable()
export class SubscriptionReminderBackfillRepository implements ISubscriptionReminderBackfillRepository {
  constructor(private readonly prisma: PaymentPrismaClient) {}

  public static forTransaction(
    transaction: PaymentPrismaClient,
  ): SubscriptionReminderBackfillRepository {
    return new SubscriptionReminderBackfillRepository(transaction);
  }

  public async findCandidatePage(input: {
    status: SubscriptionStatus.ACTIVE | SubscriptionStatus.QUEUED;
    now: Date;
    cursor: SubscriptionReminderBackfillCursor | null;
    limit: number;
  }): Promise<SubscriptionReminderBackfillCandidate[]> {
    const status = this.toPrismaStatus(input.status);
    const records = await this.prisma.subscription.findMany({
      where: {
        status,
        endsAt: { gt: input.now },
        ...(input.cursor
          ? {
              OR: [
                { endsAt: { gt: input.cursor.endsAt } },
                { endsAt: input.cursor.endsAt, id: { gt: input.cursor.id } },
              ],
            }
          : {}),
      },
      select: { id: true, userId: true, endsAt: true },
      orderBy: [{ endsAt: 'asc' }, { id: 'asc' }],
      take: input.limit,
    });
    return records;
  }

  public async findAuthoritativePeriods(input: {
    ids: string[];
    status: SubscriptionStatus.ACTIVE | SubscriptionStatus.QUEUED;
    now: Date;
  }): Promise<SubscriptionReminderBackfillPeriod[]> {
    if (input.ids.length === 0) return [];
    const records = await this.prisma.subscription.findMany({
      where: {
        id: { in: input.ids },
        status: this.toPrismaStatus(input.status),
        endsAt: { gt: input.now },
      },
      include: { product: true },
    });
    const userIds = [...new Set(records.map((record) => record.userId))];
    const successors = await this.prisma.subscription.findMany({
      where: { userId: { in: userIds }, status: PrismaSubscriptionStatus.QUEUED },
      include: { product: true },
    });
    return records.map((record) => {
      const successor = successors.find(
        (candidate) =>
          candidate.userId === record.userId && candidate.sequence === record.sequence + 1,
      );
      return {
        subscription: PaymentPrismaMapper.subscriptionToDomain(record),
        billingInterval: PaymentPrismaMapper.billingIntervalToDomain(
          record.product.billingInterval,
        ),
        immediateSuccessor: successor ? PaymentPrismaMapper.subscriptionToDomain(successor) : null,
      };
    });
  }

  private toPrismaStatus(status: SubscriptionStatus): PrismaSubscriptionStatus {
    return status === SubscriptionStatus.ACTIVE
      ? PrismaSubscriptionStatus.ACTIVE
      : PrismaSubscriptionStatus.QUEUED;
  }
}
