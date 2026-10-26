import { randomUUID } from 'node:crypto';
import { IsolatedAdminDatabase } from '../../../main-gateway-service/test/superadmin/isolated-admin-database';
import { createIsolatedPostDatabase, POST_PROJECTION_MIGRATION } from '../isolated-post-database';
import type { PrismaClient } from '../../src/core/prisma/client';
import { PostAdminUserProfileRepository } from '../../src/modules/posts/infrastructure/repositories/post-admin-user-profile.repository';
import type {
  ApplyPostProfileResult,
  RepairPostProfileResult,
} from '../../src/modules/posts/application/ports/post-admin-user-profile.port';
import {
  PaymentUserProfileContractError,
  type PaymentUserProfileSnapshot,
} from '../../../../libs/contracts/src/events/payment-user-profile-snapshot';

const POST_ID = '10000000-0000-4000-8000-000000000001';
const OWNER_ID = '20000000-0000-4000-8000-000000000001';
const IMAGE_ID = '30000000-0000-4000-8000-000000000001';
const FILE_ID = '40000000-0000-4000-8000-000000000001';
const OUTBOX_ID = '50000000-0000-4000-8000-000000000001';

function snapshot(
  input: { userId?: string; version?: string } = {},
): Extract<PaymentUserProfileSnapshot, { isDeleted: false; profileExists: true }> {
  return {
    userId: input.userId ?? randomUUID(),
    sourceVersion: input.version ?? '1',
    username: 'real_source_name',
    profileExists: true,
    isDeleted: false,
  };
}

function gate(): { promise: Promise<void>; open: () => void } {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

describe('D2a Post profile storage on disposable PostgreSQL', () => {
  jest.setTimeout(120000);
  const database = new IsolatedAdminDatabase();
  let post: PrismaClient;

  function apply(value: PaymentUserProfileSnapshot): Promise<ApplyPostProfileResult> {
    return post.$transaction((transaction) =>
      PostAdminUserProfileRepository.forTransaction({ transaction, rootClient: post }).apply(value),
    );
  }

  function repair(value: PaymentUserProfileSnapshot): Promise<RepairPostProfileResult> {
    return post.$transaction((transaction) =>
      PostAdminUserProfileRepository.forTransaction({
        transaction,
        rootClient: post,
      }).repairEqualVersionFromTrustedExport(value),
    );
  }

  beforeAll(async () => {
    await database.start();
    post = createIsolatedPostDatabase({
      database,
      beforeProjectionMigration: (sql) =>
        sql(`
      INSERT INTO "Post" ("id","ownerId","description","updatedAt")
      VALUES ('${POST_ID}','${OWNER_ID}','Preserved post','2026-10-26T12:00:00Z');
      INSERT INTO "PostImage" ("id","postId","fileId","order")
      VALUES ('${IMAGE_ID}','${POST_ID}','${FILE_ID}',0);
      INSERT INTO "OutboxEvent" ("id","type","payload")
      VALUES ('${OUTBOX_ID}','POST_DELETED','{"postId":"preserved-legacy-event"}');
    `),
    });
  });
  afterAll(async () => {
    await post?.$disconnect();
    await database.stop();
  });

  it('deploys the new migration over an explicit baseline, preserving fixtures and NOT_READY', async () => {
    expect(await post.post.findUniqueOrThrow({ where: { id: POST_ID } })).toMatchObject({
      ownerId: OWNER_ID,
      description: 'Preserved post',
      deletedAt: null,
    });
    expect(await post.postImage.findUniqueOrThrow({ where: { id: IMAGE_ID } })).toMatchObject({
      postId: POST_ID,
      fileId: FILE_ID,
      order: 0,
    });
    expect(await post.outboxEvent.findUniqueOrThrow({ where: { id: OUTBOX_ID } })).toMatchObject({
      type: 'POST_DELETED',
      status: 'PENDING',
      payload: { postId: 'preserved-legacy-event' },
    });
    expect(await post.postAdminUserProfile.count()).toBe(0);
    expect(await post.postAdminUserProjectionSync.findMany()).toEqual([
      expect.objectContaining({
        id: 'post-user-profile-v1',
        phase: 'NOT_READY',
        mode: 'IDLE',
        cursor: null,
        upperUserId: null,
        sourceEmpty: false,
        passId: null,
        sourceWritersConfirmedAt: null,
        sourceDeploymentRevision: null,
        leaseOwner: null,
        leaseUntil: null,
        leaseGeneration: 0n,
      }),
    ]);
    expect(
      await post.$queryRaw<{ finished: boolean }[]>`
      SELECT finished_at IS NOT NULL AS finished FROM "_prisma_migrations"
      WHERE migration_name = ${POST_PROJECTION_MIGRATION}
    `,
    ).toEqual([{ finished: true }]);
  });

  it('keeps TEXT IDs and exact bigint versions, classifies duplicates/conflicts and protects tombstones', async () => {
    const initial = snapshot({ userId: 'source TEXT user, not UUID', version: '0' });
    expect(await apply(initial)).toEqual({ outcome: 'APPLIED' });
    const newer = { ...initial, sourceVersion: '9007199254740993' };
    expect(await apply(newer)).toEqual({ outcome: 'APPLIED' });
    expect(await apply(initial)).toEqual({ outcome: 'STALE' });
    expect(await apply(newer)).toEqual({ outcome: 'UNCHANGED' });
    expect(await apply({ ...newer, username: 'conflicting' })).toEqual({
      outcome: 'PROTOCOL_CONFLICT',
      reason: 'VERSION_CONTENT_MISMATCH',
    });
    expect(
      (await post.postAdminUserProfile.findUniqueOrThrow({ where: { userId: initial.userId } }))
        .sourceVersion,
    ).toBe(9007199254740993n);
    const tombstone: PaymentUserProfileSnapshot = {
      ...initial,
      sourceVersion: '9007199254740994',
      username: null,
      isDeleted: true,
    };
    expect(await apply(tombstone)).toEqual({ outcome: 'APPLIED' });
    expect(await apply({ ...newer, sourceVersion: '9223372036854775807' })).toEqual({
      outcome: 'PROTOCOL_CONFLICT',
      reason: 'TOMBSTONE_RESURRECTION',
    });
    expect(await repair({ ...newer, sourceVersion: tombstone.sourceVersion })).toEqual({
      outcome: 'PROTOCOL_CONFLICT',
      reason: 'TOMBSTONE_RESURRECTION',
    });
  });

  it('uses shared validation and database constraints without reclassifying storage errors', async () => {
    const value = snapshot();
    await expect(apply({ ...value, sourceVersion: '9223372036854775808' })).rejects.toBeInstanceOf(
      PaymentUserProfileContractError,
    );
    await expect(
      apply({ ...value, profileExists: false } as unknown as PaymentUserProfileSnapshot),
    ).rejects.toBeInstanceOf(PaymentUserProfileContractError);
    await expect(
      post.postAdminUserProfile.create({
        data: {
          userId: 'invalid-direct-row',
          sourceVersion: -1n,
          username: null,
          profileExists: true,
          isDeleted: false,
        },
      }),
    ).rejects.toThrow();
    await expect(
      post.$transaction(async (transaction) => {
        await transaction.$executeRaw`SET LOCAL transaction_read_only = on`;
        return PostAdminUserProfileRepository.forTransaction({
          transaction,
          rootClient: post,
        }).apply(value);
      }),
    ).rejects.toThrow();
    expect(
      await post.postAdminUserProfile.findUnique({ where: { userId: value.userId } }),
    ).toBeNull();
    expect(() =>
      PostAdminUserProfileRepository.forTransaction({ transaction: post, rootClient: post }),
    ).toThrow('Post profile transaction required');
  });

  it('serializes first inserts and different revisions without overwriting a newer snapshot', async () => {
    const value = snapshot();
    const inserted = gate();
    const release = gate();
    const competing = gate();
    const first = post.$transaction(async (transaction) => {
      const result = await PostAdminUserProfileRepository.forTransaction({
        transaction,
        rootClient: post,
      }).apply({ ...value, sourceVersion: '20' });
      inserted.open();
      await release.promise;
      return result;
    });
    await Promise.race([inserted.promise, first]);
    const second = post.$transaction(async (transaction) => {
      competing.open();
      return PostAdminUserProfileRepository.forTransaction({ transaction, rootClient: post }).apply(
        { ...value, sourceVersion: '10' },
      );
    });
    await competing.promise;
    release.open();
    expect(await Promise.all([first, second])).toEqual([
      { outcome: 'APPLIED' },
      { outcome: 'STALE' },
    ]);
    const outcomes = await Promise.all(
      ['21', '30'].map((sourceVersion) => apply({ ...value, sourceVersion })),
    );
    expect(
      outcomes.every((result) => result.outcome === 'APPLIED' || result.outcome === 'STALE'),
    ).toBe(true);
    expect(
      (await post.postAdminUserProfile.findUniqueOrThrow({ where: { userId: value.userId } }))
        .sourceVersion,
    ).toBe(30n);
  });

  it('repairs only the expected version and rolls back apply/repair with caller progress and Post writes', async () => {
    const value = snapshot();
    expect(await repair(value)).toEqual({ outcome: 'NOT_FOUND' });
    await apply(value);
    const trusted = { ...value, username: 'trusted_source' };
    expect(await repair(trusted)).toEqual({ outcome: 'REPAIRED' });
    expect(await repair(trusted)).toEqual({ outcome: 'UNCHANGED' });
    await apply({ ...trusted, sourceVersion: '2' });
    expect(await repair(value)).toEqual({ outcome: 'VERSION_MISMATCH' });
    const rollbackValue = snapshot();
    await expect(
      post.$transaction(async (transaction) => {
        const repository = PostAdminUserProfileRepository.forTransaction({
          transaction,
          rootClient: post,
        });
        await repository.apply(rollbackValue);
        await repository.repairEqualVersionFromTrustedExport({
          ...trusted,
          sourceVersion: '2',
          username: 'rollback',
        });
        await transaction.post.update({
          where: { id: POST_ID },
          data: { description: 'rolled back' },
        });
        await transaction.postAdminUserProjectionSync.update({
          where: { id: 'post-user-profile-v1' },
          data: { cursor: 'rollback' },
        });
        throw new Error('Controlled caller rollback');
      }),
    ).rejects.toThrow('Controlled caller rollback');
    expect(
      await post.postAdminUserProfile.findUnique({ where: { userId: rollbackValue.userId } }),
    ).toBeNull();
    expect(
      (await post.postAdminUserProfile.findUniqueOrThrow({ where: { userId: value.userId } }))
        .username,
    ).toBe('trusted_source');
    expect((await post.post.findUniqueOrThrow({ where: { id: POST_ID } })).description).toBe(
      'Preserved post',
    );
    expect(
      (
        await post.postAdminUserProjectionSync.findUniqueOrThrow({
          where: { id: 'post-user-profile-v1' },
        })
      ).cursor,
    ).toBeNull();
    const committed = snapshot();
    await post.$transaction(async (transaction) => {
      await PostAdminUserProfileRepository.forTransaction({ transaction, rootClient: post }).apply(
        committed,
      );
      await transaction.postAdminUserProjectionSync.update({
        where: { id: 'post-user-profile-v1' },
        data: { cursor: 'committed' },
      });
    });
    expect(
      await post.postAdminUserProfile.findUnique({ where: { userId: committed.userId } }),
    ).not.toBeNull();
    expect(
      (
        await post.postAdminUserProjectionSync.findUniqueOrThrow({
          where: { id: 'post-user-profile-v1' },
        })
      ).cursor,
    ).toBe('committed');
  });
});
