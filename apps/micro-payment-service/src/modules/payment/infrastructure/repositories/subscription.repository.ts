import { Inject, Injectable } from '@nestjs/common';
import { Prisma, SubscriptionStatus } from '../../../../core/prisma/client';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { SubscriptionEntity } from '../../domain/entities/subscription.entity';
import {
  DueActiveSubscriptionClaim,
  ISubscriptionRepository,
  OwnedSubscriptionLookup,
  SubscriptionProviderIdentifierLookup,
} from '../../domain/interfaces/subscription.repository.interface';
import { PaymentPrismaMapper } from '../mappers/payment-prisma.mapper';
import type { PaymentPrismaClient } from './payment-prisma-client.type';

type ClaimedSubscriptionId = { id: string };

@Injectable()
export class SubscriptionRepository implements ISubscriptionRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PaymentPrismaClient) {}

  public async insert(subscription: SubscriptionEntity): Promise<void> {
    await this.prisma.subscription.create({
      data: PaymentPrismaMapper.subscriptionToPrisma(subscription),
    });
  }

  public async save(subscription: SubscriptionEntity): Promise<void> {
    const data = PaymentPrismaMapper.subscriptionToPrisma(subscription);
    await this.prisma.subscription.update({ where: { id: subscription.id }, data });
  }

  public async findOwnedById(lookup: OwnedSubscriptionLookup): Promise<SubscriptionEntity | null> {
    const record = await this.prisma.subscription.findFirst({
      where: { id: lookup.id, userId: lookup.userId },
      include: { product: true },
    });
    return record ? PaymentPrismaMapper.subscriptionToDomain(record) : null;
  }

  public async findActiveByUserId(userId: string): Promise<SubscriptionEntity | null> {
    const record = await this.prisma.subscription.findFirst({
      where: { userId, status: SubscriptionStatus.ACTIVE },
      include: { product: true },
    });
    return record ? PaymentPrismaMapper.subscriptionToDomain(record) : null;
  }

  public async findOrderedUnfinishedByUserId(userId: string): Promise<SubscriptionEntity[]> {
    const records = await this.prisma.subscription.findMany({
      where: { userId, status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.QUEUED] } },
      include: { product: true },
      orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
    });
    return records.map((record) => PaymentPrismaMapper.subscriptionToDomain(record));
  }

  public async findTailByUserId(userId: string): Promise<SubscriptionEntity | null> {
    const record = await this.prisma.subscription.findFirst({
      where: { userId, status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.QUEUED] } },
      include: { product: true },
      orderBy: [{ sequence: 'desc' }, { id: 'desc' }],
    });
    return record ? PaymentPrismaMapper.subscriptionToDomain(record) : null;
  }

  public async claimDueActive(claim: DueActiveSubscriptionClaim): Promise<SubscriptionEntity[]> {
    const ids = await this.prisma.$queryRaw<ClaimedSubscriptionId[]>(Prisma.sql`
      SELECT "id" FROM "subscriptions"
      WHERE "status" = 'ACTIVE'::"SubscriptionStatus" AND "ends_at" <= ${claim.dueAt}
      ORDER BY "ends_at" ASC, "id" ASC
      LIMIT ${claim.limit}
      FOR UPDATE SKIP LOCKED
    `);
    if (ids.length === 0) return [];
    const records = await this.prisma.subscription.findMany({
      where: { id: { in: ids.map(({ id }) => id) } },
      include: { product: true },
      orderBy: [{ endsAt: 'asc' }, { id: 'asc' }],
    });
    return records.map((record) => PaymentPrismaMapper.subscriptionToDomain(record));
  }

  public async findByProviderSubscriptionId(
    lookup: SubscriptionProviderIdentifierLookup,
  ): Promise<SubscriptionEntity | null> {
    const record = await this.prisma.subscription.findUnique({
      where: {
        provider_providerSubscriptionId: {
          provider: lookup.provider.getValue(),
          providerSubscriptionId: lookup.providerIdentifier,
        },
      },
      include: { product: true },
    });
    return record ? PaymentPrismaMapper.subscriptionToDomain(record) : null;
  }

  public async findByProviderScheduleId(
    lookup: SubscriptionProviderIdentifierLookup,
  ): Promise<SubscriptionEntity | null> {
    const record = await this.prisma.subscription.findUnique({
      where: {
        provider_providerScheduleId: {
          provider: lookup.provider.getValue(),
          providerScheduleId: lookup.providerIdentifier,
        },
      },
      include: { product: true },
    });
    return record ? PaymentPrismaMapper.subscriptionToDomain(record) : null;
  }
}
