import {
  normalizePaymentUserProfileSnapshot,
  parsePaymentProfileVersion,
  type PaymentUserProfileSnapshot,
} from '../../../../../../../libs/contracts/src/events/payment-user-profile-snapshot';
import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import {
  IAdminUserProfileSnapshotRepository,
  type ApplyProfileSnapshotResult,
  type RepairProfileSnapshotResult,
} from '../../application/ports/admin-user-profile-snapshot.port';
import type { PaymentPrismaClient } from './payment-prisma-client.type';
import type { PrismaClient } from '../../../../core/prisma/client';

type StoredSnapshot = {
  userId: string;
  sourceVersion: bigint;
  username: string | null;
  profileExists: boolean;
  isDeleted: boolean;
};

export class AdminUserProfileSnapshotRepository extends IAdminUserProfileSnapshotRepository {
  private constructor(private readonly transaction: PaymentPrismaClient) {
    super();
  }

  public static forTransaction(input: {
    transaction: PaymentPrismaClient;
    rootClient: PrismaClient;
  }): AdminUserProfileSnapshotRepository {
    // Prisma Proxy method shape is not proof of a transaction. Compare against the issuing root.
    if (input.transaction === input.rootClient) {
      throw new DomainException({
        code: DomainExceptionCode.InternalServerError,
        message: 'Payment profile transaction required',
      });
    }
    return new AdminUserProfileSnapshotRepository(input.transaction);
  }

  public async apply(input: PaymentUserProfileSnapshot): Promise<ApplyProfileSnapshotResult> {
    const snapshot = normalizePaymentUserProfileSnapshot(input);
    const version = parsePaymentProfileVersion(snapshot.sourceVersion);
    // A competing first insert waits for its transaction, then conflicts on the same PK.
    const inserted = await this.transaction.$executeRaw`
      INSERT INTO "admin_user_profile_read_model"
        ("user_id", "source_version", "username", "profile_exists", "is_deleted")
      VALUES (${snapshot.userId}, ${version}, ${snapshot.username}, ${snapshot.profileExists}, ${snapshot.isDeleted})
      ON CONFLICT ("user_id") DO NOTHING
    `;
    if (inserted === 1) return { outcome: 'APPLIED' };
    const stored = await this.lock(snapshot.userId);
    if (!stored) throw this.storageInvariantError();
    if (version < stored.sourceVersion) return { outcome: 'STALE' };
    if (version === stored.sourceVersion) {
      if (this.sameContent({ stored, snapshot })) return { outcome: 'UNCHANGED' };
      return { outcome: 'PROTOCOL_CONFLICT', reason: 'VERSION_CONTENT_MISMATCH' };
    }
    if (stored.isDeleted && !snapshot.isDeleted) {
      return { outcome: 'PROTOCOL_CONFLICT', reason: 'TOMBSTONE_RESURRECTION' };
    }
    await this.replace({ stored, snapshot });
    return { outcome: 'APPLIED' };
  }

  public async repairEqualVersionFromTrustedExport(
    input: PaymentUserProfileSnapshot,
  ): Promise<RepairProfileSnapshotResult> {
    const snapshot = normalizePaymentUserProfileSnapshot(input);
    const stored = await this.lock(snapshot.userId);
    if (!stored) return { outcome: 'NOT_FOUND' };
    if (stored.sourceVersion !== parsePaymentProfileVersion(snapshot.sourceVersion)) {
      return { outcome: 'VERSION_MISMATCH' };
    }
    if (stored.isDeleted && !snapshot.isDeleted) {
      return { outcome: 'PROTOCOL_CONFLICT', reason: 'TOMBSTONE_RESURRECTION' };
    }
    if (this.sameContent({ stored, snapshot })) return { outcome: 'UNCHANGED' };
    await this.replace({ stored, snapshot });
    return { outcome: 'REPAIRED' };
  }

  private async lock(userId: string): Promise<StoredSnapshot | null> {
    const rows = await this.transaction.$queryRaw<StoredSnapshot[]>`
      SELECT "user_id" AS "userId", "source_version" AS "sourceVersion", "username",
             "profile_exists" AS "profileExists", "is_deleted" AS "isDeleted"
      FROM "admin_user_profile_read_model" WHERE "user_id" = ${userId} FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  private sameContent(input: {
    stored: StoredSnapshot;
    snapshot: PaymentUserProfileSnapshot;
  }): boolean {
    return (
      input.stored.username === input.snapshot.username &&
      input.stored.profileExists === input.snapshot.profileExists &&
      input.stored.isDeleted === input.snapshot.isDeleted
    );
  }

  private async replace(input: {
    stored: StoredSnapshot;
    snapshot: PaymentUserProfileSnapshot;
  }): Promise<void> {
    // lock() holds the row until the caller commits; the predicate also makes expected version explicit.
    const changed = await this.transaction.adminUserProfileReadModel.updateMany({
      where: { userId: input.snapshot.userId, sourceVersion: input.stored.sourceVersion },
      data: {
        sourceVersion: parsePaymentProfileVersion(input.snapshot.sourceVersion),
        username: input.snapshot.username,
        profileExists: input.snapshot.profileExists,
        isDeleted: input.snapshot.isDeleted,
      },
    });
    if (changed.count !== 1) throw this.storageInvariantError();
  }

  private storageInvariantError(): DomainException {
    return new DomainException({
      code: DomainExceptionCode.InternalServerError,
      message: 'Payment profile storage unavailable',
    });
  }
}
