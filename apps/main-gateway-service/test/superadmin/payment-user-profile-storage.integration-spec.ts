import { randomUUID } from 'node:crypto';
import { IsolatedAdminDatabase } from './isolated-admin-database';
import { createIsolatedPaymentDatabase } from './isolated-payment-database';
import type { PrismaService } from '../../src/core/prisma/prisma.service';
import type { PrismaClient as PaymentClient } from '../../../micro-payment-service/src/core/prisma/client';
import { AdminUserProfileSnapshotRepository } from '../../../micro-payment-service/src/modules/payment/infrastructure/repositories/admin-user-profile-snapshot.repository';
import type {
  ApplyProfileSnapshotResult,
  RepairProfileSnapshotResult,
} from '../../../micro-payment-service/src/modules/payment/application/ports/admin-user-profile-snapshot.port';
import type { PaymentUserProfileSnapshot } from '../../../../libs/contracts/src/events/payment-user-profile-snapshot';
import { PrismaUsersRepository } from '../../src/modules/users/infrastructure/users.repository';

const GATEWAY_MIGRATION = '20261025130000_add_payment_user_profile_outbox';
const PAYMENT_MIGRATION = '20261025130000_add_admin_user_projection';
const USER_ID = '20000000-0000-4000-8000-000000000001';
const PRODUCT_ID = '30000000-0000-4000-8000-000000000001';
const SUBSCRIPTION_ID = '40000000-0000-4000-8000-000000000001';
const TRANSACTION_ID = '50000000-0000-4000-8000-000000000001';
const SYNC_ID = 'payment-user-profile-v1';
const TIME = new Date('2026-10-25T12:00:00.000Z');

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
function snapshot(
  input: { userId?: string; version?: string; username?: string } = {},
): Extract<PaymentUserProfileSnapshot, { isDeleted: false; profileExists: true }> {
  return {
    userId: input.userId ?? randomUUID(),
    sourceVersion: input.version ?? '1',
    username: input.username ?? 'fixture_name',
    profileExists: true,
    isDeleted: false,
  };
}

describe('P1a storage/migrate deploy/apply on real isolated Gateway and Payment PostgreSQL', () => {
  jest.setTimeout(120000);
  const database = new IsolatedAdminDatabase();
  let gateway: PrismaService;
  let payment: PaymentClient;

  function apply(value: PaymentUserProfileSnapshot): Promise<ApplyProfileSnapshotResult> {
    return payment.$transaction((transaction) =>
      AdminUserProfileSnapshotRepository.forTransaction({ transaction, rootClient: payment }).apply(
        value,
      ),
    );
  }
  function repair(value: PaymentUserProfileSnapshot): Promise<RepairProfileSnapshotResult> {
    return payment.$transaction((transaction) =>
      AdminUserProfileSnapshotRepository.forTransaction({
        transaction,
        rootClient: payment,
      }).repairEqualVersionFromTrustedExport(value),
    );
  }

  beforeAll(async () => {
    await database.start({
      deployLastWithPrisma: true,
      beforeMigration: ({ name, database: isolated }) => {
        if (name !== GATEWAY_MIGRATION) return;
        isolated.sql(`
          INSERT INTO "User" ("id","email","isBanned","isConfirmed","updatedAt","banReasonCode")
          VALUES ('${USER_ID}','projection-fixture@example.test',true,true,'2026-10-25T12:00:00Z','BAD_BEHAVIOR');
          INSERT INTO "Profile" ("id","userId","username","updatedAt")
          VALUES ('projection-profile','${USER_ID}','projection_fixture','2026-10-25T12:00:00Z');
          INSERT INTO "Session" ("id","userId","deviceId","deviceName","ip","iat","exp","updatedAt")
          VALUES ('projection-session','${USER_ID}','fixture-device','fixture','192.0.2.1',100,200,'2026-10-25T12:00:00Z');
          INSERT INTO "AdminSession" ("id","tokenHash","createdAt","lastSeenAt","idleExpiresAt","absoluteExpiresAt")
          VALUES ('fixture-admin','${'a'.repeat(64)}',now(),now(),now()+interval '30 minutes',now()+interval '8 hours');
          INSERT INTO "AdminUserActionAudit" ("id","action","targetUserId","outcome","occurredAt","adminSessionId","banReasonCode")
          VALUES ('fixture-audit','BLOCK','${USER_ID}','BLOCKED','2026-10-25T12:00:00Z','fixture-admin','BAD_BEHAVIOR');
          INSERT INTO "UserAccessRevokeOutbox" ("id","userId","sessionIds","availableAt")
          VALUES ('fixture-revoke','${USER_ID}',ARRAY['projection-session'],'2026-10-25T12:00:00Z');
        `);
      },
    });
    gateway = database.client();
    payment = createIsolatedPaymentDatabase(database, {
      deployLastWithPrisma: true,
      beforeMigration: ({ name, sql }) => {
        if (name !== PAYMENT_MIGRATION) return;
        sql(`
          INSERT INTO "products" ("id","code","name","billing_interval","billing_interval_count","price_minor","currency","updated_at")
          VALUES ('${PRODUCT_ID}','PROFILE_FIXTURE','Preserved product','MONTH',1,900,'EUR','2026-10-25T12:00:00Z');
          INSERT INTO "subscriptions" ("id","user_id","product_id","provider","sequence","status","auto_renew","starts_at","ends_at","updated_at")
          VALUES ('${SUBSCRIPTION_ID}','${USER_ID}','${PRODUCT_ID}','STRIPE',1,'ACTIVE',false,'2026-10-25T12:00:00Z','2026-11-25T12:00:00Z','2026-10-25T12:00:00Z');
          INSERT INTO "payment_transactions" ("id","user_id","product_id","subscription_id","provider","kind","status","amount_minor","currency","idempotency_key","updated_at","provider_invoice_id","paid_at")
          VALUES ('${TRANSACTION_ID}','${USER_ID}','${PRODUCT_ID}','${SUBSCRIPTION_ID}','STRIPE','RENEWAL','SUCCEEDED',900,'EUR','fixture-payment','2026-10-25T12:00:00Z','fixture-invoice','2026-10-25T12:00:00Z');
        `);
      },
    });
  });
  afterAll(async () => {
    await payment?.$disconnect();
    await database.stop();
  });

  it('deploys both new migrations over explicit baselines, preserves fixtures and starts NOT_READY', async () => {
    expect(await gateway.user.findUnique({ where: { id: USER_ID } })).toMatchObject({
      isBanned: true,
      isConfirmed: true,
      banReasonCode: 'BAD_BEHAVIOR',
      paymentProfileVersion: 0n,
      updatedAt: TIME,
    });
    expect(await gateway.profile.findUnique({ where: { id: 'projection-profile' } })).toMatchObject(
      { username: 'projection_fixture', userId: USER_ID, updatedAt: TIME },
    );
    expect(await gateway.session.findUnique({ where: { id: 'projection-session' } })).toMatchObject(
      { deviceId: 'fixture-device', iat: 100, exp: 200, deletedAt: null },
    );
    expect(await gateway.adminSession.findUnique({ where: { id: 'fixture-admin' } })).toMatchObject(
      { revokedAt: null },
    );
    expect(
      await gateway.adminUserActionAudit.findUnique({ where: { id: 'fixture-audit' } }),
    ).toMatchObject({ outcome: 'BLOCKED', banReasonCode: 'BAD_BEHAVIOR' });
    expect(
      await gateway.userAccessRevokeOutbox.findUnique({ where: { id: 'fixture-revoke' } }),
    ).toMatchObject({ sessionIds: ['projection-session'], availableAt: TIME });
    expect(await gateway.paymentUserProfileOutbox.count()).toBe(0);
    expect(await payment.product.findUnique({ where: { id: PRODUCT_ID } })).toMatchObject({
      name: 'Preserved product',
      priceMinor: 900,
      updatedAt: TIME,
    });
    expect(await payment.subscription.findUnique({ where: { id: SUBSCRIPTION_ID } })).toMatchObject(
      { status: 'ACTIVE', autoRenew: false, productId: PRODUCT_ID, updatedAt: TIME },
    );
    expect(
      await payment.paymentTransaction.findUnique({ where: { id: TRANSACTION_ID } }),
    ).toMatchObject({
      amountMinor: 900,
      currency: 'EUR',
      subscriptionId: SUBSCRIPTION_ID,
      updatedAt: TIME,
    });
    expect(await payment.adminUserProfileReadModel.count()).toBe(0);
    expect(await payment.adminUserProjectionSync.findMany()).toEqual([
      expect.objectContaining({
        id: SYNC_ID,
        phase: 'NOT_READY',
        mode: 'IDLE',
        leaseGeneration: 0n,
        cursor: null,
        sourceWritersConfirmedAt: null,
        sourceDeploymentRevision: null,
      }),
    ]);
    const gatewayRows = await gateway.$queryRaw<
      { finished: boolean }[]
    >`SELECT finished_at IS NOT NULL AS finished FROM "_prisma_migrations" WHERE migration_name=${GATEWAY_MIGRATION}`;
    const paymentRows = await payment.$queryRaw<
      { finished: boolean }[]
    >`SELECT finished_at IS NOT NULL AS finished FROM "_prisma_migrations" WHERE migration_name=${PAYMENT_MIGRATION}`;
    expect(gatewayRows).toEqual([{ finished: true }]);
    expect(paymentRows).toEqual([{ finished: true }]);
  });

  it('keeps ordinary/stale User writes from resetting the technical version, ban or deletion', async () => {
    const users = new PrismaUsersRepository(gateway);
    const stale = await users.findById(USER_ID);
    expect(stale).not.toBeNull();
    expect(stale).not.toHaveProperty('paymentProfileVersion');
    await gateway.user.update({
      where: { id: USER_ID },
      data: { paymentProfileVersion: 9007199254740993n },
    });
    await users.update(stale!);
    expect(await gateway.user.findUnique({ where: { id: USER_ID } })).toMatchObject({
      paymentProfileVersion: 9007199254740993n,
      isBanned: true,
      banReasonCode: 'BAD_BEHAVIOR',
    });
    await gateway.user.update({ where: { id: USER_ID }, data: { deletedAt: TIME } });
    await expect(users.update(stale!)).rejects.toMatchObject({ code: 404 });
    expect((await gateway.user.findUniqueOrThrow({ where: { id: USER_ID } })).deletedAt).toEqual(
      TIME,
    );
    const created = await gateway.user.create({ data: { email: 'new-version@fixture.test' } });
    expect(created.paymentProfileVersion).toBe(0n);
    expect(await gateway.paymentUserProfileOutbox.count()).toBe(0); // Raw Prisma fixtures/ordinary updates above are not projected-state commands.
  });

  it('applies versions exactly above MAX_SAFE_INTEGER, ignores stale/duplicates and reports conflicts', async () => {
    const initial = snapshot({ userId: 'legacy TEXT ID', version: '0' });
    expect(await apply(initial)).toEqual({ outcome: 'APPLIED' });
    const newer = { ...initial, sourceVersion: '9007199254740993', username: 'new' };
    expect(await apply(newer)).toEqual({ outcome: 'APPLIED' });
    expect(await apply({ ...initial, sourceVersion: '9007199254740992' })).toEqual({
      outcome: 'STALE',
    });
    expect(await apply(newer)).toEqual({ outcome: 'UNCHANGED' });
    expect(await apply({ ...newer, username: 'different' })).toEqual({
      outcome: 'PROTOCOL_CONFLICT',
      reason: 'VERSION_CONTENT_MISMATCH',
    });
    expect(
      (
        await payment.adminUserProfileReadModel.findUniqueOrThrow({
          where: { userId: initial.userId },
        })
      ).sourceVersion,
    ).toBe(9007199254740993n);
    expect(await apply({ ...newer, sourceVersion: '9223372036854775807' })).toEqual({
      outcome: 'APPLIED',
    });
    expect(
      (
        await payment.adminUserProfileReadModel.findUniqueOrThrow({
          where: { userId: initial.userId },
        })
      ).sourceVersion,
    ).toBe(9223372036854775807n);
  });

  it('protects tombstones and gives only the separate trusted repair equal-version correction', async () => {
    const initial = snapshot();
    expect(await repair(initial)).toEqual({ outcome: 'NOT_FOUND' });
    await apply(initial);
    const corrected = { ...initial, username: 'corrected' };
    expect(await repair(corrected)).toEqual({ outcome: 'REPAIRED' });
    expect(await repair(corrected)).toEqual({ outcome: 'UNCHANGED' });
    await apply({ ...initial, sourceVersion: '2', username: 'newer' });
    expect(await repair(corrected)).toEqual({ outcome: 'VERSION_MISMATCH' });
    expect(
      (
        await payment.adminUserProfileReadModel.findUniqueOrThrow({
          where: { userId: initial.userId },
        })
      ).username,
    ).toBe('newer');
    const deleted: PaymentUserProfileSnapshot = {
      ...initial,
      sourceVersion: '3',
      username: null,
      isDeleted: true,
    };
    await apply(deleted);
    expect(await apply(initial)).toEqual({ outcome: 'STALE' });
    expect(await apply({ ...initial, sourceVersion: '4' })).toEqual({
      outcome: 'PROTOCOL_CONFLICT',
      reason: 'TOMBSTONE_RESURRECTION',
    });
    expect(await repair({ ...initial, sourceVersion: '3' })).toEqual({
      outcome: 'PROTOCOL_CONFLICT',
      reason: 'TOMBSTONE_RESURRECTION',
    });
    expect(await repair({ ...deleted, profileExists: false })).toEqual({ outcome: 'REPAIRED' });
    expect(
      await payment.adminUserProfileReadModel.findUnique({ where: { userId: initial.userId } }),
    ).toMatchObject({ isDeleted: true, username: null, sourceVersion: 3n });
  });

  it.each([
    { initial: false, first: '2', second: '2', result: 'UNCHANGED' },
    { initial: false, first: '2', second: '3', result: 'APPLIED' },
    { initial: true, first: '3', second: '2', result: 'STALE' },
  ])('serializes competing inserts/versions through real row locks (case %#)', async (scenario) => {
    const value = snapshot();
    if (scenario.initial) await apply(value);
    const locked = deferred();
    const release = deferred();
    const first = payment.$transaction(async (transaction) => {
      const result = await AdminUserProfileSnapshotRepository.forTransaction({
        transaction,
        rootClient: payment,
      }).apply({
        ...value,
        sourceVersion: scenario.first,
      });
      locked.resolve();
      await release.promise;
      return result;
    });
    await Promise.race([locked.promise, first]);
    const second = apply({ ...value, sourceVersion: scenario.second });
    try {
      const deadline = Date.now() + 5000;
      let observed = false;
      while (Date.now() < deadline) {
        const rows = await payment.$queryRaw<
          { count: number }[]
        >`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%admin_user_profile_read_model%'`;
        if (rows[0].count > 0) {
          observed = true;
          break;
        }
      }
      expect(observed).toBe(true);
    } finally {
      release.resolve();
    }
    expect(await first).toEqual({ outcome: 'APPLIED' });
    expect(await second).toEqual({ outcome: scenario.result });
    const expected =
      BigInt(scenario.first) > BigInt(scenario.second)
        ? BigInt(scenario.first)
        : BigInt(scenario.second);
    expect(
      (
        await payment.adminUserProfileReadModel.findUniqueOrThrow({
          where: { userId: value.userId },
        })
      ).sourceVersion,
    ).toBe(expected);
  });

  it('commits/rolls snapshot back with another Payment record in the same tx, without root autocommit', async () => {
    const value = snapshot();
    const write = async (fail: boolean): Promise<void> => {
      await payment.$transaction(async (transaction) => {
        await AdminUserProfileSnapshotRepository.forTransaction({
          transaction,
          rootClient: payment,
        }).apply(value);
        await transaction.adminUserProjectionSync.update({
          where: { id: SYNC_ID },
          data: { cursor: value.userId, leaseGeneration: 9007199254740993n },
        });
        if (fail) throw new Error('fixture-rollback');
      });
    };
    await expect(write(true)).rejects.toThrow('fixture-rollback');
    expect(
      await payment.adminUserProfileReadModel.findUnique({ where: { userId: value.userId } }),
    ).toBeNull();
    expect(
      await payment.adminUserProjectionSync.findUnique({ where: { id: SYNC_ID } }),
    ).toMatchObject({ cursor: null, leaseGeneration: 0n });
    await write(false);
    expect(
      await payment.adminUserProjectionSync.findUnique({ where: { id: SYNC_ID } }),
    ).toMatchObject({
      cursor: value.userId,
      leaseGeneration: 9007199254740993n,
      phase: 'NOT_READY',
    });
    expect(() =>
      AdminUserProfileSnapshotRepository.forTransaction({
        transaction: payment,
        rootClient: payment,
      }),
    ).toThrow('Payment profile transaction required');
  });

  it('does not turn a DB failure into protocol conflict', async () => {
    await payment.$executeRawUnsafe(
      'ALTER TABLE "admin_user_profile_read_model" ADD CONSTRAINT "fixture_apply_failure" CHECK(false) NOT VALID',
    );
    try {
      await expect(apply(snapshot())).rejects.toMatchObject({ code: 'P2010' });
    } finally {
      await payment.$executeRawUnsafe(
        'ALTER TABLE "admin_user_profile_read_model" DROP CONSTRAINT "fixture_apply_failure"',
      );
    }
  });

  it('enforces minimal DB constraints and outbox uniqueness without a User FK', async () => {
    await expect(
      gateway.user.update({ where: { id: USER_ID }, data: { paymentProfileVersion: -1n } }),
    ).rejects.toThrow();
    const data = {
      userId: 'missing source TEXT ID',
      sourceVersion: 1n,
      payload: { fixture: true },
    };
    await gateway.paymentUserProfileOutbox.create({ data });
    await expect(gateway.paymentUserProfileOutbox.create({ data })).rejects.toThrow();
    for (const change of [
      { sourceVersion: -1n },
      { profileExists: false },
      { isDeleted: true },
      { username: '' },
    ]) {
      await expect(
        payment.adminUserProfileReadModel.create({
          data: {
            userId: randomUUID(),
            sourceVersion: 0n,
            username: 'name',
            profileExists: true,
            isDeleted: false,
            ...change,
          },
        }),
      ).rejects.toThrow();
    }
    await expect(
      payment.adminUserProjectionSync.create({ data: { id: 'another-singleton' } }),
    ).rejects.toThrow();
    await expect(
      payment.adminUserProjectionSync.update({
        where: { id: SYNC_ID },
        data: { leaseGeneration: -1n },
      }),
    ).rejects.toThrow();
  });
});
