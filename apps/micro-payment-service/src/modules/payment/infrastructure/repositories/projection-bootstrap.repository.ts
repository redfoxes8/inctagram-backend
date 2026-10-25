import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import {
  IProjectionBootstrapRepository,
  type ProjectionLease,
} from '../../application/ports/payment-profile-bootstrap.port';
import {
  normalizePaymentProfileExportPage,
  type PaymentProfileExportPage,
} from '../../../../../../../libs/contracts/src/events/payment-user-profile-export';
import { AdminUserProfileSnapshotRepository } from './admin-user-profile-snapshot.repository';
import type { PaymentPrismaClient } from './payment-prisma-client.type';

const SYNC_ID = 'payment-user-profile-v1';
type ClaimedRow = {
  leaseOwner: string;
  leaseGeneration: bigint;
  upperUserId: string | null;
  cursor: string | null;
};

@Injectable()
export class ProjectionBootstrapRepository extends IProjectionBootstrapRepository {
  private readonly logger = new Logger(ProjectionBootstrapRepository.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async claim(): Promise<ProjectionLease | null> {
    const owner = randomUUID();
    const passId = randomUUID();
    // A single conditional UPDATE serializes claim, throttle, and generation across instances.
    const rows = await this.prisma.$queryRaw<ClaimedRow[]>`
      UPDATE "admin_user_projection_sync"
      SET "lease_owner" = ${owner}::uuid, "lease_generation" = "lease_generation" + 1,
          "lease_until" = clock_timestamp() + interval '30 seconds',
          "last_batch_at" = clock_timestamp(),
          "phase" = CASE WHEN "phase" = 'NOT_READY' THEN 'LOADING'::"AdminUserProjectionPhase" ELSE "phase" END,
          "mode" = CASE WHEN "mode" <> 'IDLE' THEN "mode"
                        WHEN "phase" = 'READY' THEN 'RECONCILE'::"AdminUserProjectionMode"
                        ELSE 'BOOTSTRAP'::"AdminUserProjectionMode" END,
          "pass_id" = CASE WHEN "mode" = 'IDLE' THEN ${passId}::uuid ELSE "pass_id" END,
          "upper_user_id" = CASE WHEN "mode" = 'IDLE' THEN NULL ELSE "upper_user_id" END,
          "cursor" = CASE WHEN "mode" = 'IDLE' THEN NULL ELSE "cursor" END,
          "source_empty" = CASE WHEN "mode" = 'IDLE' THEN false ELSE "source_empty" END
      WHERE "id" = ${SYNC_ID}
        AND ("lease_until" IS NULL OR "lease_until" <= clock_timestamp())
        AND "next_run_at" <= clock_timestamp()
        AND ("last_batch_at" IS NULL OR "last_batch_at" <= clock_timestamp() - interval '1 second')
        AND "source_writers_confirmed_at" IS NOT NULL
        AND length(btrim("source_deployment_revision")) > 0
      RETURNING "lease_owner" AS "leaseOwner", "lease_generation" AS "leaseGeneration",
                "upper_user_id" AS "upperUserId", "cursor"
    `;
    const row = rows[0];
    return row
      ? {
          owner: row.leaseOwner,
          generation: row.leaseGeneration,
          request: {
            limit: 500,
            upperUserId: row.upperUserId ?? undefined,
            afterUserId: row.cursor ?? undefined,
          },
        }
      : null;
  }

  async complete(input: {
    lease: ProjectionLease;
    page: PaymentProfileExportPage;
    consumerConnected: () => boolean;
  }): Promise<void> {
    const page = normalizePaymentProfileExportPage({
      value: input.page,
      request: input.lease.request,
    });
    const diagnostics = await this.prisma.$transaction(
      async (transaction) => {
        await this.assertLease({ transaction, lease: input.lease });
        const repository = AdminUserProfileSnapshotRepository.forTransaction({
          transaction,
          rootClient: this.prisma,
        });
        let staleCount = 0;
        let repairedCount = 0;
        for (const snapshot of page.items) {
          const result = await repository.apply(snapshot);
          if (result.outcome === 'STALE') staleCount += 1;
          if (result.outcome === 'PROTOCOL_CONFLICT') {
            // Only this trusted export path can repair an equal-version content discrepancy.
            const repair = await repository.repairEqualVersionFromTrustedExport(snapshot);
            if (repair.outcome === 'REPAIRED') repairedCount += 1;
            if (repair.outcome === 'PROTOCOL_CONFLICT' || repair.outcome === 'NOT_FOUND') {
              throw new Error('PROFILE_EXPORT_PROTOCOL_CONFLICT');
            }
          }
        }
        if (!input.consumerConnected()) throw new Error('PROFILE_CONSUMER_NOT_CONNECTED');
        const changed = await transaction.$executeRaw`
        UPDATE "admin_user_projection_sync"
        SET "upper_user_id" = ${page.upperUserId ?? null}, "cursor" = ${page.nextAfterUserId ?? null},
            "source_empty" = ${page.sourceEmpty},
            "phase" = CASE WHEN ${page.complete} THEN 'READY'::"AdminUserProjectionPhase" ELSE "phase" END,
            "mode" = CASE WHEN ${page.complete} THEN 'IDLE'::"AdminUserProjectionMode" ELSE "mode" END,
            "last_completed_at" = CASE WHEN ${page.complete} THEN clock_timestamp() ELSE "last_completed_at" END,
            "next_run_at" = clock_timestamp() + CASE WHEN ${page.complete} THEN interval '24 hours' ELSE interval '0 seconds' END,
            "lease_owner" = NULL, "lease_until" = NULL
        WHERE "id" = ${SYNC_ID} AND "lease_owner" = ${input.lease.owner}::uuid
          AND "lease_generation" = ${input.lease.generation} AND "lease_until" > clock_timestamp()
          AND "source_writers_confirmed_at" IS NOT NULL AND length(btrim("source_deployment_revision")) > 0
      `;
        if (changed !== 1) throw new Error('PROFILE_SYNC_LEASE_LOST');
        return { staleCount, repairedCount };
      },
      { timeout: 30000 },
    );
    if (diagnostics.staleCount > 0)
      this.logger.warn({
        event: 'payment.profile.reconcile',
        code: 'SOURCE_BEHIND',
        count: diagnostics.staleCount,
      });
    if (diagnostics.repairedCount > 0)
      this.logger.warn({
        event: 'payment.profile.reconcile',
        code: 'TRUSTED_REPAIR',
        count: diagnostics.repairedCount,
      });
  }

  async retry(input: { lease: ProjectionLease; delaySeconds: number }): Promise<void> {
    const delay = Math.max(1, Math.min(300, input.delaySeconds));
    await this.prisma.$executeRaw`
      UPDATE "admin_user_projection_sync"
      SET "next_run_at" = clock_timestamp() + ${delay} * interval '1 second',
          "lease_owner" = NULL, "lease_until" = NULL
      WHERE "id" = ${SYNC_ID} AND "lease_owner" = ${input.lease.owner}::uuid
        AND "lease_generation" = ${input.lease.generation} AND "lease_until" > clock_timestamp()
    `;
  }

  private async assertLease(input: {
    transaction: PaymentPrismaClient;
    lease: ProjectionLease;
  }): Promise<void> {
    const rows = await input.transaction.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "admin_user_projection_sync"
      WHERE "id" = ${SYNC_ID} AND "lease_owner" = ${input.lease.owner}::uuid
        AND "lease_generation" = ${input.lease.generation} AND "lease_until" > clock_timestamp()
      FOR UPDATE
    `;
    if (rows.length !== 1) throw new Error('PROFILE_SYNC_LEASE_LOST');
  }
}
