import { Inject, Injectable } from '@nestjs/common';
import { Prisma, ProviderWebhookEventStatus } from '../../../../core/prisma/client';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { ProviderWebhookEventEntity } from '../../domain/entities/provider-webhook-event.entity';
import {
  IProviderWebhookEventRepository,
  ProviderEventClaim,
  ProviderEventLookup,
  TimedOutProviderEventClaim,
} from '../../domain/interfaces/provider-webhook-event.repository.interface';
import { PaymentPrismaMapper } from '../mappers/payment-prisma.mapper';
import type { PaymentPrismaClient } from './payment-prisma-client.type';

type ClaimedWebhookId = { id: string };

@Injectable()
export class ProviderWebhookEventRepository implements IProviderWebhookEventRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PaymentPrismaClient) {}

  public async insert(event: ProviderWebhookEventEntity): Promise<void> {
    await this.prisma.providerWebhookEvent.create({
      data: PaymentPrismaMapper.webhookEventToPrisma(event),
    });
  }

  public async save(event: ProviderWebhookEventEntity): Promise<void> {
    await this.prisma.providerWebhookEvent.update({
      where: { id: event.id },
      data: PaymentPrismaMapper.webhookEventToPrisma(event),
    });
  }

  public async findByProviderEventId(
    lookup: ProviderEventLookup,
  ): Promise<ProviderWebhookEventEntity | null> {
    const record = await this.prisma.providerWebhookEvent.findUnique({
      where: {
        provider_providerEventId: {
          provider: lookup.provider.getValue(),
          providerEventId: lookup.providerEventId,
        },
      },
    });
    return record ? PaymentPrismaMapper.webhookEventToDomain(record) : null;
  }

  public async claimForProcessing(
    claim: ProviderEventClaim,
  ): Promise<ProviderWebhookEventEntity | null> {
    const existing = await this.prisma.providerWebhookEvent.findUnique({
      where: {
        provider_providerEventId: {
          provider: claim.provider.getValue(),
          providerEventId: claim.providerEventId,
        },
      },
      select: { id: true },
    });
    if (!existing) return null;
    const updated = await this.prisma.providerWebhookEvent.updateMany({
      where: {
        id: existing.id,
        status: { in: [ProviderWebhookEventStatus.RECEIVED, ProviderWebhookEventStatus.FAILED] },
        attempts: { lt: claim.maxAttempts },
      },
      data: {
        status: ProviderWebhookEventStatus.PROCESSING,
        attempts: { increment: 1 },
        processingError: null,
      },
    });
    if (updated.count !== 1) return null;
    const record = await this.prisma.providerWebhookEvent.findUnique({
      where: { id: existing.id },
    });
    return record ? PaymentPrismaMapper.webhookEventToDomain(record) : null;
  }

  public async reclaimTimedOutProcessing(
    claim: TimedOutProviderEventClaim,
  ): Promise<ProviderWebhookEventEntity[]> {
    const ids = await this.prisma.$queryRaw<ClaimedWebhookId[]>(Prisma.sql`
      UPDATE "provider_webhook_events"
      SET "attempts" = "attempts" + 1, "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" IN (
        SELECT "id" FROM "provider_webhook_events"
        WHERE "status" = 'PROCESSING'::"ProviderWebhookEventStatus"
          AND "updated_at" < ${claim.staleBefore}
          AND "attempts" < ${claim.maxAttempts}
        ORDER BY "updated_at" ASC, "id" ASC
        LIMIT ${claim.limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "id"
    `);
    if (ids.length === 0) return [];
    const records = await this.prisma.providerWebhookEvent.findMany({
      where: { id: { in: ids.map(({ id }) => id) } },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
    });
    return records.map((record) => PaymentPrismaMapper.webhookEventToDomain(record));
  }
}
