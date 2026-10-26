import type { Prisma, PrismaClient } from '../../../../core/prisma/client';
import {
  normalizePaymentUserProfileSnapshot,
  parsePaymentProfileVersion,
  type PaymentUserProfileSnapshot,
} from '../../../../../../../libs/contracts/src/events/payment-user-profile-snapshot';
import {
  PostAdminUserProfiles,
  type ApplyPostProfileResult,
  type RepairPostProfileResult,
} from '../../application/ports/post-admin-user-profile.port';
import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';

type StoredPostProfile = {
  userId: string;
  sourceVersion: bigint;
  username: string | null;
  profileExists: boolean;
  isDeleted: boolean;
};

export class PostAdminUserProfileRepository extends PostAdminUserProfiles {
  private constructor(private readonly transaction: Prisma.TransactionClient) {
    super();
  }

  static forTransaction(input: {
    transaction: Prisma.TransactionClient;
    rootClient: PrismaClient;
  }): PostAdminUserProfileRepository {
    // As in the existing Payment boundary, compare with the issuing root, not Proxy method shape.
    if (input.transaction === input.rootClient) {
      throw new DomainException({
        code: DomainExceptionCode.InternalServerError,
        message: 'Post profile transaction required',
      });
    }
    return new PostAdminUserProfileRepository(input.transaction);
  }

  async apply(input: PaymentUserProfileSnapshot): Promise<ApplyPostProfileResult> {
    const snapshot = normalizePaymentUserProfileSnapshot(input);
    const incomingVersion = parsePaymentProfileVersion(snapshot.sourceVersion);
    // Concurrent first inserts serialize on the PK. The losing insert then locks the committed row.
    const inserted = await this.transaction.$executeRaw`
      INSERT INTO "post_admin_user_profile"
        ("user_id", "source_version", "username", "profile_exists", "is_deleted")
      VALUES (${snapshot.userId}, ${incomingVersion}, ${snapshot.username}, ${snapshot.profileExists}, ${snapshot.isDeleted})
      ON CONFLICT ("user_id") DO NOTHING
    `;
    if (inserted === 1) return { outcome: 'APPLIED' };

    const stored = await this.lockProfile(snapshot.userId);
    if (!stored) throw this.storageInvariantError();
    if (incomingVersion < stored.sourceVersion) return { outcome: 'STALE' };
    if (incomingVersion === stored.sourceVersion) {
      return this.hasSameContent({ stored, snapshot })
        ? { outcome: 'UNCHANGED' }
        : { outcome: 'PROTOCOL_CONFLICT', reason: 'VERSION_CONTENT_MISMATCH' };
    }
    if (stored.isDeleted && !snapshot.isDeleted) {
      return { outcome: 'PROTOCOL_CONFLICT', reason: 'TOMBSTONE_RESURRECTION' };
    }
    await this.writeProfile({ snapshot, expectedVersion: stored.sourceVersion });
    return { outcome: 'APPLIED' };
  }

  async repairEqualVersionFromTrustedExport(
    input: PaymentUserProfileSnapshot,
  ): Promise<RepairPostProfileResult> {
    const snapshot = normalizePaymentUserProfileSnapshot(input);
    const expectedVersion = parsePaymentProfileVersion(snapshot.sourceVersion);
    const stored = await this.lockProfile(snapshot.userId);
    if (!stored) return { outcome: 'NOT_FOUND' };
    if (stored.sourceVersion !== expectedVersion) return { outcome: 'VERSION_MISMATCH' };
    if (stored.isDeleted && !snapshot.isDeleted) {
      return { outcome: 'PROTOCOL_CONFLICT', reason: 'TOMBSTONE_RESURRECTION' };
    }
    if (this.hasSameContent({ stored, snapshot })) return { outcome: 'UNCHANGED' };
    await this.writeProfile({ snapshot, expectedVersion });
    return { outcome: 'REPAIRED' };
  }

  private async lockProfile(userId: string): Promise<StoredPostProfile | null> {
    const rows = await this.transaction.$queryRaw<StoredPostProfile[]>`
      SELECT "user_id" AS "userId", "source_version" AS "sourceVersion", "username",
             "profile_exists" AS "profileExists", "is_deleted" AS "isDeleted"
      FROM "post_admin_user_profile" WHERE "user_id" = ${userId} FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  private async writeProfile(input: {
    snapshot: PaymentUserProfileSnapshot;
    expectedVersion: bigint;
  }): Promise<void> {
    // The row lock lasts until the caller commits. Expected-version CAS is explicit as well.
    const result = await this.transaction.postAdminUserProfile.updateMany({
      where: { userId: input.snapshot.userId, sourceVersion: input.expectedVersion },
      data: {
        sourceVersion: parsePaymentProfileVersion(input.snapshot.sourceVersion),
        username: input.snapshot.username,
        profileExists: input.snapshot.profileExists,
        isDeleted: input.snapshot.isDeleted,
      },
    });
    if (result.count !== 1) throw this.storageInvariantError();
  }

  private hasSameContent(input: {
    stored: StoredPostProfile;
    snapshot: PaymentUserProfileSnapshot;
  }): boolean {
    return (
      input.stored.username === input.snapshot.username &&
      input.stored.profileExists === input.snapshot.profileExists &&
      input.stored.isDeleted === input.snapshot.isDeleted
    );
  }

  private storageInvariantError(): DomainException {
    return new DomainException({
      code: DomainExceptionCode.InternalServerError,
      message: 'Post profile storage unavailable',
    });
  }
}
