import { Test, type TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { IsolatedAdminDatabase } from './isolated-admin-database';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { ITransactionManager } from '../../src/common/interfaces/transaction-manager.interface';
import { SuperadminModerationModule } from '../../src/modules/superadmin/superadmin-moderation.module';
import { UserModerationRepository } from '../../src/modules/users/domain/interfaces/user-moderation.repository';
import { AdminUserActionAuditWriter } from '../../src/modules/users/domain/interfaces/admin-user-action-audit.writer';
import { PrismaUsersRepository } from '../../src/modules/users/infrastructure/users.repository';
import { UserEntity } from '../../src/modules/users/domain/user.entity';
import {
  UserBanReasonCode,
  type UserBanReason,
} from '../../../../libs/common/types/user-ban-reason';
import type { AdminUserActionAuditEntry } from '../../../../libs/common/types/admin-user-action-audit';
import { normalizeUserBanReason } from '../../../../libs/common/src/validation/normalize-user-ban-reason';

const MIGRATION = '20261025120000_add_user_ban_reasons';
const USER_ID = '10000000-0000-4000-8000-000000000052';
const ACTOR_ID = '40000000-0000-4000-8000-000000000052';
const TIME = new Date('2026-10-25T12:00:00Z');

describe('S2 reason storage using real isolated PostgreSQL and existing tx/audit', () => {
  jest.setTimeout(120000);
  const database = new IsolatedAdminDatabase();
  let prisma: PrismaService;
  let module: TestingModule;
  let transactions: ITransactionManager;
  let moderation: UserModerationRepository;
  let audit: AdminUserActionAuditWriter;

  function entry(input: {
    userId: string;
    reason?: UserBanReason | null;
  }): AdminUserActionAuditEntry {
    return {
      action: 'BLOCK',
      outcome: 'BLOCKED',
      targetUserId: input.userId,
      occurredAt: TIME,
      adminSessionId: ACTOR_ID,
      reasonSnapshot: input.reason,
    };
  }
  async function user(): Promise<string> {
    return (await prisma.user.create({ data: { email: randomUUID() + '@fixture.test' } })).id;
  }

  beforeAll(async () => {
    await database.start({
      deployLastWithPrisma: true,
      beforeMigration: ({ name, database: isolated }) => {
        if (name !== MIGRATION) return;
        // Previous schema, before reason columns exist. Synthetic fixtures only.
        isolated.sql(`
        INSERT INTO "User" ("id","email","isBanned","isConfirmed","updatedAt") VALUES ('${USER_ID}','legacy-reason@fixture.test',true,true,'2026-10-25T12:00:00Z');
        INSERT INTO "Profile" ("id","userId","username","updatedAt") VALUES ('reason-profile','${USER_ID}','legacy-reason','2026-10-25T12:00:00Z');
        INSERT INTO "Session" ("id","userId","deviceId","deviceName","ip","iat","exp","updatedAt") VALUES ('reason-session','${USER_ID}','reason-device','fixture','192.0.2.1',1,2,'2026-10-25T12:00:00Z');
        INSERT INTO "AdminSession" ("id","tokenHash","createdAt","lastSeenAt","idleExpiresAt","absoluteExpiresAt") VALUES ('${ACTOR_ID}','${'a'.repeat(64)}',now(),now(),now()+interval '30 minutes',now()+interval '8 hours');
        INSERT INTO "AdminUserActionAudit" ("id","action","targetUserId","outcome","occurredAt","adminSessionId") VALUES ('reason-audit','BLOCK','${USER_ID}','BLOCKED','2026-10-25T12:00:00Z','${ACTOR_ID}');
        INSERT INTO "UserAccessRevokeOutbox" ("id","userId","sessionIds","attempts","availableAt") VALUES ('reason-outbox','${USER_ID}',ARRAY['reason-session'],2,'2026-10-25T12:00:00Z');
      `);
      },
    });
    prisma = database.client();
    module = await Test.createTestingModule({ imports: [SuperadminModerationModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    transactions = module.get(ITransactionManager);
    moderation = module.get(UserModerationRepository);
    audit = module.get(AdminUserActionAuditWriter);
  });
  afterAll(async () => {
    await module?.close();
    await database.stop();
  });

  it('migrate deploy preserves previous User/Profile/Session/AdminSession/audit/outbox with null reason', async () => {
    expect(await prisma.user.findUnique({ where: { id: USER_ID } })).toMatchObject({
      email: 'legacy-reason@fixture.test',
      isBanned: true,
      isConfirmed: true,
      deletedAt: null,
      banReasonCode: null,
      banReasonText: null,
      updatedAt: TIME,
    });
    expect(await prisma.profile.findUnique({ where: { id: 'reason-profile' } })).toMatchObject({
      userId: USER_ID,
      username: 'legacy-reason',
      updatedAt: TIME,
    });
    expect(await prisma.session.findUnique({ where: { id: 'reason-session' } })).toMatchObject({
      userId: USER_ID,
      deviceId: 'reason-device',
      iat: 1,
      exp: 2,
      deletedAt: null,
      updatedAt: TIME,
    });
    expect(await prisma.adminSession.findUnique({ where: { id: ACTOR_ID } })).toMatchObject({
      tokenHash: 'a'.repeat(64),
      revokedAt: null,
    });
    expect(
      await prisma.adminUserActionAudit.findUnique({ where: { id: 'reason-audit' } }),
    ).toMatchObject({
      action: 'BLOCK',
      outcome: 'BLOCKED',
      targetUserId: USER_ID,
      adminSessionId: ACTOR_ID,
      occurredAt: TIME,
      banReasonCode: null,
      banReasonText: null,
    });
    expect(
      await prisma.userAccessRevokeOutbox.findUnique({ where: { id: 'reason-outbox' } }),
    ).toMatchObject({
      userId: USER_ID,
      sessionIds: ['reason-session'],
      attempts: 2,
      availableAt: TIME,
    });
    const rows = await prisma.$queryRaw<
      { finished: boolean }[]
    >`SELECT finished_at IS NOT NULL AS finished FROM "_prisma_migrations" WHERE migration_name=${MIGRATION}`;
    expect(rows).toEqual([{ finished: true }]);
  });

  it.each<UserBanReason | null>([
    null,
    { code: UserBanReasonCode.BadBehavior, text: null },
    { code: UserBanReasonCode.AdvertisingPlacement, text: null },
    { code: UserBanReasonCode.AnotherReason, text: ' normalized explanation ' },
  ])('round-trips current reason and audit snapshot in one live tx (case %#)', async (reason) => {
    const userId = await user();
    const normalized = normalizeUserBanReason(reason);
    const { auditId } = await transactions.execute(async (transaction) => {
      await moderation.lockUser({ userId, transaction });
      await moderation.setBannedWithReason({ userId, reason, occurredAt: TIME, transaction });
      expect(await moderation.lockUser({ userId, transaction })).toMatchObject({
        isBanned: true,
        banReason: normalized,
      });
      return audit.append({ entry: entry({ userId, reason }), transaction });
    });
    expect(await prisma.adminUserActionAudit.findUnique({ where: { id: auditId } })).toMatchObject({
      banReasonCode: normalized?.code ?? null,
      banReasonText: normalized?.text ?? null,
    });
    await transactions.execute(async (transaction) => {
      await moderation.lockUser({ userId, transaction });
      await moderation.clearBanAndReason({ userId, occurredAt: TIME, transaction });
    });
    expect(await prisma.user.findUnique({ where: { id: userId } })).toMatchObject({
      isBanned: false,
      banReasonCode: null,
      banReasonText: null,
    });
    expect(await prisma.adminUserActionAudit.findUnique({ where: { id: auditId } })).toMatchObject({
      banReasonCode: normalized?.code ?? null,
      banReasonText: normalized?.text ?? null,
    });
  });

  it('rolls back User reason + audit; invalid boundary inputs do not get persisted', async () => {
    const userId = await user();
    await expect(
      transactions.execute(async (transaction) => {
        await moderation.lockUser({ userId, transaction });
        await moderation.setBannedWithReason({
          userId,
          reason: { code: UserBanReasonCode.AnotherReason, text: 'reason' },
          occurredAt: TIME,
          transaction,
        });
        await audit.append({
          entry: entry({
            userId,
            reason: { code: UserBanReasonCode.AnotherReason, text: 'reason' },
          }),
          transaction,
        });
        throw new Error('fixture-rollback');
      }),
    ).rejects.toThrow('fixture-rollback');
    expect(await prisma.user.findUnique({ where: { id: userId } })).toMatchObject({
      isBanned: false,
      banReasonCode: null,
      banReasonText: null,
    });
    expect(await prisma.adminUserActionAudit.count({ where: { targetUserId: userId } })).toBe(0);
    const invalid = {
      code: UserBanReasonCode.BadBehavior,
      text: 'not permitted',
    } as unknown as UserBanReason;
    await expect(
      transactions.execute(async (transaction) => {
        await moderation.lockUser({ userId, transaction });
        await moderation.setBannedWithReason({
          userId,
          reason: invalid,
          occurredAt: TIME,
          transaction,
        });
      }),
    ).rejects.toMatchObject({ code: 400, message: 'Invalid ban reason' });
    await expect(
      transactions.execute((transaction) =>
        audit.append({ entry: entry({ userId, reason: invalid }), transaction }),
      ),
    ).rejects.toMatchObject({ code: 400 });
    expect(await prisma.adminUserActionAudit.count({ where: { targetUserId: userId } })).toBe(0);
  });

  it('enforces code/text integrity in both tables when the writer is bypassed, including Unicode boundaries', async () => {
    const userId = await user();
    for (const reason of [
      { code: null, text: 'orphan' },
      { code: 'BAD_BEHAVIOR', text: 'not permitted' },
      { code: 'ANOTHER_REASON', text: null },
      { code: 'ANOTHER_REASON', text: ' \t\u00a0 ' },
      { code: 'ANOTHER_REASON', text: '\tvalue' },
      { code: 'ANOTHER_REASON', text: 'x'.repeat(501) },
      { code: 'UNKNOWN', text: null },
    ]) {
      await expect(
        prisma.$executeRaw`UPDATE "User" SET "banReasonCode"=${reason.code}::"UserBanReasonCode","banReasonText"=${reason.text} WHERE "id"=${userId}`,
      ).rejects.toThrow();
      await expect(
        prisma.$executeRaw`INSERT INTO "AdminUserActionAudit" ("id","action","targetUserId","outcome","occurredAt","adminSessionId","banReasonCode","banReasonText") VALUES (${randomUUID()},'BLOCK',${userId},'BLOCKED',${TIME},${ACTOR_ID},${reason.code}::"UserBanReasonCode",${reason.text})`,
      ).rejects.toThrow();
    }
    const text = '😀'.repeat(500);
    await transactions.execute(async (transaction) => {
      await moderation.lockUser({ userId, transaction });
      await moderation.setBannedWithReason({
        userId,
        reason: { code: UserBanReasonCode.AnotherReason, text },
        occurredAt: TIME,
        transaction,
      });
    });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).banReasonText).toBe(
      text,
    );
  });

  it('ordinary/stale entity writes preserve reason/ban and cannot restore deleted', async () => {
    const users = new PrismaUsersRepository(prisma);
    const stale = await users.save(UserEntity.createNew(randomUUID() + '@fixture.test', null));
    await transactions.execute(async (transaction) => {
      await moderation.lockUser({ userId: stale.id, transaction });
      await moderation.setBannedWithReason({
        userId: stale.id,
        reason: { code: UserBanReasonCode.BadBehavior, text: null },
        occurredAt: TIME,
        transaction,
      });
    });
    stale.confirmEmail();
    await users.update(stale);
    await expect(users.save(stale)).rejects.toThrow(); // INSERT, not upsert: no overwrite of the existing ID.
    expect(await prisma.user.findUnique({ where: { id: stale.id } })).toMatchObject({
      isBanned: true,
      isConfirmed: true,
      banReasonCode: 'BAD_BEHAVIOR',
      banReasonText: null,
    });
    await prisma.user.update({ where: { id: stale.id }, data: { deletedAt: TIME } }); // State fixture, not a delete use case.
    await expect(users.update(stale)).rejects.toMatchObject({ code: 404 });
    expect(await prisma.user.findUnique({ where: { id: stale.id } })).toMatchObject({
      deletedAt: TIME,
      isBanned: true,
      banReasonCode: 'BAD_BEHAVIOR',
    });
  });

  it('has no autocommit fallback for root/completed transaction handles', async () => {
    const userId = await user();
    const completed = await transactions.execute((transaction) => Promise.resolve(transaction));
    for (const transaction of [undefined, null, {}, prisma, completed]) {
      await expect(moderation.lockUser({ userId, transaction })).rejects.toMatchObject({
        code: 500,
      });
      await expect(
        moderation.setBannedWithReason({ userId, reason: null, occurredAt: TIME, transaction }),
      ).rejects.toMatchObject({ code: 500 });
      await expect(
        moderation.clearBanAndReason({ userId, occurredAt: TIME, transaction }),
      ).rejects.toMatchObject({ code: 500 });
    }
  });
});
