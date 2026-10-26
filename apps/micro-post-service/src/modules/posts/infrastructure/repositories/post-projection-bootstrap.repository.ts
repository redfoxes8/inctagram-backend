import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../../../core/prisma/client';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import {
  PostProjectionProgress,
  type PostProjectionLease,
} from '../../application/ports/post-profile-bootstrap.port';
import {
  normalizePaymentProfileExportPage,
  type PaymentProfileExportPage,
} from '../../../../../../../libs/contracts/src/events/payment-user-profile-export';
import { PostAdminUserProfileRepository } from './post-admin-user-profile.repository';

const SYNC_ID = 'post-user-profile-v1';
type ClaimedProgress = {
  leaseOwner: string;
  leaseGeneration: bigint;
  upperUserId: string | null;
  cursor: string | null;
};

@Injectable()
export class PostProjectionBootstrapRepository extends PostProjectionProgress {
  private readonly logger = new Logger(PostProjectionBootstrapRepository.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async claim(): Promise<PostProjectionLease | null> {
    // One persisted conditional update coordinates instances, resume and the 1s batch throttle.
    const rows = await this.prisma.$queryRaw<ClaimedProgress[]>`
      UPDATE "post_admin_user_projection_sync"
      SET "lease_owner" = ${randomUUID()}::uuid, "lease_generation" = "lease_generation" + 1,
          "lease_until" = clock_timestamp() + interval '30 seconds', "last_batch_at" = clock_timestamp(),
          "phase" = CASE WHEN "phase" = 'NOT_READY' THEN 'LOADING'::"PostAdminUserProjectionPhase" ELSE "phase" END,
          "mode" = CASE WHEN "mode" <> 'IDLE' THEN "mode"
                        WHEN "phase" = 'READY' THEN 'RECONCILE'::"PostAdminUserProjectionMode"
                        ELSE 'BOOTSTRAP'::"PostAdminUserProjectionMode" END,
          "pass_id" = CASE WHEN "mode" = 'IDLE' THEN ${randomUUID()}::uuid ELSE "pass_id" END,
          "upper_user_id" = CASE WHEN "mode" = 'IDLE' THEN NULL ELSE "upper_user_id" END,
          "cursor" = CASE WHEN "mode" = 'IDLE' THEN NULL ELSE "cursor" END,
          "source_empty" = CASE WHEN "mode" = 'IDLE' THEN false ELSE "source_empty" END
      WHERE "id" = ${SYNC_ID}
        AND ("lease_until" IS NULL OR "lease_until" <= clock_timestamp())
        AND "next_run_at" <= clock_timestamp()
        AND ("last_batch_at" IS NULL OR "last_batch_at" <= clock_timestamp() - interval '1 second')
        AND "source_writers_confirmed_at" IS NOT NULL AND length(btrim("source_deployment_revision")) > 0
      RETURNING "lease_owner" AS "leaseOwner", "lease_generation" AS "leaseGeneration",
                "upper_user_id" AS "upperUserId", "cursor"
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      owner: row.leaseOwner,
      generation: row.leaseGeneration,
      request: {
        limit: 500,
        upperUserId: row.upperUserId ?? undefined,
        afterUserId: row.cursor ?? undefined,
      },
    };
  }

  async complete(input: {
    lease: PostProjectionLease;
    page: PaymentProfileExportPage;
    consumerConnected: () => boolean;
  }): Promise<void> {
    const page = normalizePaymentProfileExportPage({
      value: input.page,
      request: input.lease.request,
    });
    const diagnostics = await this.prisma.$transaction(
      async (transaction) => {
        await this.lockLease({ transaction, lease: input.lease });
        const profiles = PostAdminUserProfileRepository.forTransaction({
          transaction,
          rootClient: this.prisma,
        });
        let repaired = 0;
        let stale = 0;
        for (const snapshot of page.items) {
          const result = await profiles.apply(snapshot);
          if (result.outcome === 'STALE') stale++;
          if (result.outcome === 'PROTOCOL_CONFLICT') {
            // This capability is restricted to trusted export, not ordinary incoming events.
            const repair = await profiles.repairEqualVersionFromTrustedExport(snapshot);
            if (repair.outcome !== 'REPAIRED' && repair.outcome !== 'UNCHANGED') {
              throw new Error('POST_PROFILE_EXPORT_CONFLICT');
            }
            if (repair.outcome === 'REPAIRED') repaired++;
          }
        }
        if (!input.consumerConnected()) throw new Error('POST_PROFILE_CONSUMER_NOT_CONNECTED');
        // clock_timestamp(), unlike now(), observes time spent applying this page under the lock.
        const changed = await transaction.$executeRaw`
        UPDATE "post_admin_user_projection_sync"
        SET "upper_user_id" = ${page.upperUserId ?? null}, "cursor" = ${page.nextAfterUserId ?? null},
            "source_empty" = ${page.sourceEmpty},
            "phase" = CASE WHEN ${page.complete} THEN 'READY'::"PostAdminUserProjectionPhase" ELSE "phase" END,
            "mode" = CASE WHEN ${page.complete} THEN 'IDLE'::"PostAdminUserProjectionMode" ELSE "mode" END,
            "last_completed_at" = CASE WHEN ${page.complete} THEN clock_timestamp() ELSE "last_completed_at" END,
            "next_run_at" = clock_timestamp() + CASE WHEN ${page.complete} THEN interval '24 hours' ELSE interval '0 seconds' END,
            "lease_owner" = NULL, "lease_until" = NULL
        WHERE "id" = ${SYNC_ID} AND "lease_owner" = ${input.lease.owner}::uuid
          AND "lease_generation" = ${input.lease.generation} AND "lease_until" > clock_timestamp()
          AND "source_writers_confirmed_at" IS NOT NULL AND length(btrim("source_deployment_revision")) > 0
      `;
        if (changed !== 1) throw new Error('POST_PROFILE_SYNC_LEASE_LOST');
        return { repaired, stale };
      },
      { timeout: 30000 },
    );
    if (diagnostics.repaired > 0 || diagnostics.stale > 0) {
      this.logger.warn({
        event: 'post.profile.reconcile',
        code: 'SOURCE_RECONCILED',
        ...diagnostics,
      });
    }
  }

  async retry(input: { lease: PostProjectionLease; delaySeconds: number }): Promise<void> {
    const delay = Math.max(1, Math.min(300, input.delaySeconds));
    await this.prisma.$executeRaw`
      UPDATE "post_admin_user_projection_sync"
      SET "next_run_at" = clock_timestamp() + ${delay} * interval '1 second',
          "lease_owner" = NULL, "lease_until" = NULL
      WHERE "id" = ${SYNC_ID} AND "lease_owner" = ${input.lease.owner}::uuid
        AND "lease_generation" = ${input.lease.generation} AND "lease_until" > clock_timestamp()
    `;
  }

  private async lockLease(input: {
    transaction: Prisma.TransactionClient;
    lease: PostProjectionLease;
  }): Promise<void> {
    const rows = await input.transaction.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "post_admin_user_projection_sync"
      WHERE "id" = ${SYNC_ID} AND "lease_owner" = ${input.lease.owner}::uuid
        AND "lease_generation" = ${input.lease.generation} AND "lease_until" > clock_timestamp()
      FOR UPDATE
    `;
    if (rows.length !== 1) throw new Error('POST_PROFILE_SYNC_LEASE_LOST');
  }
}
