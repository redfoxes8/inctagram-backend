import { Test, type TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { IsolatedAdminDatabase } from './isolated-admin-database';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { ITransactionManager } from '../../src/common/interfaces/transaction-manager.interface';
import { UserStateAuditModule } from '../../src/modules/users/user-state-audit.module';
import { UserAccessStateQuery } from '../../src/modules/users/domain/interfaces/user-access-state.query';
import { AdminUserActionAuditWriter } from '../../src/modules/users/domain/interfaces/admin-user-action-audit.writer';
import { UserAccessState } from '../../../../libs/common/types/user-access-state';
import type {
  AdminUserActionAuditEntry,
  AdminUserActionResult,
} from '../../../../libs/common/types/admin-user-action-audit';
import { PrismaUsersRepository } from '../../src/modules/users/infrastructure/users.repository';
import { PrismaUsersQueryRepository } from '../../src/modules/users/infrastructure/users.query-repository';
import { UserEntity } from '../../src/modules/users/domain/user.entity';
import { ProfileEntity } from '../../src/modules/users/domain/profile.entity';
import { UserPrismaMapper } from '../../src/modules/users/infrastructure/mappers/user.prisma.mapper';
import { RegisterUserDto } from '../../src/modules/auth/api/dto/register-user.dto';
import { createValidationPipeOptions } from '../../../../libs/common/src/setup/validation-pipe-options';
import { LocalStrategy } from '../../src/common/strategies/local.strategy';
import { BcryptService } from '../../src/modules/users/infrastructure/password.service';
import { ProfileRepository } from '../../src/modules/users/infrastructure/profile.repository';
import { PrismaAdminSessionRepository } from '../../src/modules/superadmin/infrastructure/prisma-admin-session.repository';
import {
  createAdminToken,
  hashAdminToken,
} from '../../src/modules/superadmin/application/admin-token';

const MIGRATION = '20261018130000_add_user_state_audit';
const USER_ID = '10000000-0000-4000-8000-000000000041';
const DELETED_USER_ID = '10000000-0000-4000-8000-000000000042';
const PROFILE_ID = '20000000-0000-4000-8000-000000000041';
const SESSION_ID = '30000000-0000-4000-8000-000000000041';
const ADMIN_SESSION_ID = '40000000-0000-4000-8000-000000000041';
const DEVICE_ID = '50000000-0000-4000-8000-000000000041';
const OCCURRED_AT = new Date('2026-10-18T12:05:00.000Z');
const VALID_RESULTS: AdminUserActionResult[] = [
  { action: 'BLOCK', outcome: 'BLOCKED' },
  { action: 'BLOCK', outcome: 'ALREADY_BLOCKED' },
  { action: 'BLOCK', outcome: 'USER_DELETED' },
  { action: 'BLOCK', outcome: 'NOT_FOUND' },
  { action: 'UNBLOCK', outcome: 'UNBLOCKED' },
  { action: 'UNBLOCK', outcome: 'ALREADY_ACTIVE' },
  { action: 'UNBLOCK', outcome: 'USER_DELETED' },
  { action: 'UNBLOCK', outcome: 'NOT_FOUND' },
  { action: 'DELETE', outcome: 'DELETED' },
  { action: 'DELETE', outcome: 'ALREADY_DELETED' },
  { action: 'DELETE', outcome: 'NOT_FOUND' },
];

describe('SA-GQL-04A state and transactional audit (real isolated PostgreSQL)', () => {
  jest.setTimeout(120000);
  const database = new IsolatedAdminDatabase();
  let prisma: PrismaService;
  let module: TestingModule;
  let query: UserAccessStateQuery;
  let writer: AdminUserActionAuditWriter;
  let transactions: ITransactionManager;
  let seededBeforeMigration = false;

  function auditEntry(
    result: AdminUserActionResult = { action: 'BLOCK', outcome: 'BLOCKED' },
  ): AdminUserActionAuditEntry {
    return {
      ...result,
      targetUserId: USER_ID,
      adminSessionId: ADMIN_SESSION_ID,
      occurredAt: OCCURRED_AT,
    };
  }

  beforeAll(async (): Promise<void> => {
    await database.start({
      beforeMigration: ({ name, database }): void => {
        if (name !== MIGRATION) return;
        // Seed the PREVIOUS schema: isBanned/audit do not exist yet. No application env/DB involved.
        database.sql(`
        INSERT INTO "User" ("id", "email", "passwordHash", "isConfirmed", "accountType", "createdAt", "updatedAt", "deletedAt")
        VALUES ('${USER_ID}', 'preserved-state@example.test', 'isolated-user-digest', true, 'BUSINESS', '2026-10-17T10:00:00Z', '2026-10-17T11:00:00Z', NULL);
        INSERT INTO "User" ("id", "email", "isConfirmed", "createdAt", "updatedAt", "deletedAt")
        VALUES ('${DELETED_USER_ID}', 'preserved-deleted@example.test', false, '2026-10-17T10:00:00Z', '2026-10-17T11:00:00Z', '2026-10-17T12:00:00Z');
        INSERT INTO "Profile" ("id", "userId", "username", "firstName", "avatarFileId", "avatarUrl", "createdAt", "updatedAt")
        VALUES ('${PROFILE_ID}', '${USER_ID}', 'preserved_fixture', 'Fixture', 'fixture-file', 'https://files.example.test/fixture', '2026-10-17T10:00:00Z', '2026-10-17T11:00:00Z');
        INSERT INTO "Session" ("id", "userId", "deviceId", "deviceName", "ip", "iat", "exp", "createdAt", "updatedAt", "deletedAt")
        VALUES ('${SESSION_ID}', '${USER_ID}', '${DEVICE_ID}', 'fixture-browser', '192.0.2.1', 1, 2, '2026-10-17T10:00:00Z', '2026-10-17T11:00:00Z', '2026-10-17T12:00:00Z');
        INSERT INTO "AdminSession" ("id", "tokenHash", "createdAt", "lastSeenAt", "idleExpiresAt", "absoluteExpiresAt", "revokedAt")
        VALUES ('${ADMIN_SESSION_ID}', '${'a'.repeat(64)}', '2026-10-18T12:00:00Z', '2026-10-18T12:01:00Z', '2026-10-18T12:31:00Z', '2026-10-18T20:00:00Z', NULL);
      `);
        seededBeforeMigration = true;
      },
    });
    prisma = database.client();
    module = await Test.createTestingModule({ imports: [UserStateAuditModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    query = module.get(UserAccessStateQuery);
    writer = module.get(AdminUserActionAuditWriter);
    transactions = module.get(ITransactionManager);
  });

  beforeEach(async (): Promise<void> => {
    await prisma.adminUserActionAudit.deleteMany();
  });

  afterAll(async (): Promise<void> => {
    await module?.close();
    await database.stop();
  });

  it('migrates the previous schema, preserves User/Profile/Sessions/AdminSession, and backfills false', async (): Promise<void> => {
    expect(seededBeforeMigration).toBe(true);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: USER_ID } })).toEqual({
      id: USER_ID,
      email: 'preserved-state@example.test',
      passwordHash: 'isolated-user-digest',
      isConfirmed: true,
      isBanned: false,
      banReasonCode: null,
      banReasonText: null,
      accountType: 'BUSINESS',
      createdAt: new Date('2026-10-17T10:00:00Z'),
      updatedAt: new Date('2026-10-17T11:00:00Z'),
      deletedAt: null,
    });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: DELETED_USER_ID } })).toEqual({
      id: DELETED_USER_ID,
      email: 'preserved-deleted@example.test',
      passwordHash: null,
      isConfirmed: false,
      isBanned: false,
      banReasonCode: null,
      banReasonText: null,
      accountType: 'PERSONAL',
      createdAt: new Date('2026-10-17T10:00:00Z'),
      updatedAt: new Date('2026-10-17T11:00:00Z'),
      deletedAt: new Date('2026-10-17T12:00:00Z'),
    });
    expect(await query.findByUserId({ userId: DELETED_USER_ID })).toBe(UserAccessState.Deleted);
    expect(await new PrismaUsersRepository(prisma).findById(DELETED_USER_ID)).toBeNull();
    expect(await prisma.profile.findUniqueOrThrow({ where: { id: PROFILE_ID } })).toEqual({
      id: PROFILE_ID,
      userId: USER_ID,
      username: 'preserved_fixture',
      firstName: 'Fixture',
      lastName: null,
      dateOfBirth: null,
      country: null,
      city: null,
      aboutMe: null,
      avatarFileId: 'fixture-file',
      avatarUrl: 'https://files.example.test/fixture',
      createdAt: new Date('2026-10-17T10:00:00Z'),
      updatedAt: new Date('2026-10-17T11:00:00Z'),
    });
    expect(await prisma.session.findUniqueOrThrow({ where: { id: SESSION_ID } })).toEqual({
      id: SESSION_ID,
      userId: USER_ID,
      deviceId: DEVICE_ID,
      deviceName: 'fixture-browser',
      ip: '192.0.2.1',
      iat: 1,
      exp: 2,
      createdAt: new Date('2026-10-17T10:00:00Z'),
      updatedAt: new Date('2026-10-17T11:00:00Z'),
      deletedAt: new Date('2026-10-17T12:00:00Z'),
    });
    expect(
      await prisma.adminSession.findUniqueOrThrow({ where: { id: ADMIN_SESSION_ID } }),
    ).toEqual({
      id: ADMIN_SESSION_ID,
      tokenHash: 'a'.repeat(64),
      createdAt: new Date('2026-10-18T12:00:00Z'),
      lastSeenAt: new Date('2026-10-18T12:01:00Z'),
      idleExpiresAt: new Date('2026-10-18T12:31:00Z'),
      absoluteExpiresAt: new Date('2026-10-18T20:00:00Z'),
      revokedAt: null,
    });
    const columns = await prisma.$queryRaw<{ is_nullable: string; column_default: string }[]>`
      SELECT is_nullable, column_default FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'isBanned'`;
    expect(columns).toEqual([{ is_nullable: 'NO', column_default: 'false' }]);
    const fresh = await prisma.user.create({ data: { email: `${randomUUID()}@example.test` } });
    expect(fresh.isBanned).toBe(false);
    expect(fresh.isConfirmed).toBe(false);
    expect(fresh.deletedAt).toBeNull();
  });

  it('creates/restores entity state and does not reset a persisted ban on normal or stale entity updates', async (): Promise<void> => {
    const repository = new PrismaUsersRepository(prisma);
    const created = await repository.save(
      UserEntity.createNew(`${randomUUID()}@example.test`, null),
    );
    expect(created.isBanned).toBe(false);
    const stale = await repository.findById(created.id);
    expect(stale).not.toBeNull();
    await prisma.user.update({ where: { id: created.id }, data: { isBanned: true } });
    const current = await repository.findByEmail(created.email);
    expect(current?.isBanned).toBe(true);
    current!.confirmEmail();
    const confirmed = await repository.update(current!);
    expect(confirmed.isBanned).toBe(true);
    expect(confirmed.isConfirmed).toBe(true);
    stale!.updateCredentials({ email: `${randomUUID()}@example.test`, passwordHash: null });
    const updated = await repository.update(stale!);
    expect(updated.isBanned).toBe(true);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: created.id } })).isBanned).toBe(
      true,
    );
    const record = await prisma.user.findUniqueOrThrow({ where: { id: created.id } });
    expect(UserPrismaMapper.toDomain(record).isBanned).toBe(true);
  });

  it('preserves the existing User/Profile repository transaction pattern without introducing admin audit', async (): Promise<void> => {
    const users = new PrismaUsersRepository(prisma);
    const profiles = new ProfileRepository(prisma);
    const created = await transactions.execute(async (transaction) => {
      const user = await users.save(
        UserEntity.createNew(`${randomUUID()}@example.test`, null),
        transaction,
      );
      await profiles.save(
        ProfileEntity.createNew(user.id, `fixture_${randomUUID().slice(0, 8)}`),
        transaction,
      );
      return user;
    });
    expect(created.isBanned).toBe(false);
    expect(created.isConfirmed).toBe(false);
    expect(await prisma.profile.findUnique({ where: { userId: created.id } })).not.toBeNull();
    expect(await prisma.adminUserActionAudit.count()).toBe(0);
  });

  it('returns exactly ACTIVE/BLOCKED/DELETED/null, prioritizes deletion, and hides deleted only in normal reads', async (): Promise<void> => {
    expect(await query.findByUserId({ userId: randomUUID() })).toBeNull();
    const repository = new PrismaUsersRepository(prisma);
    const normalRead = new PrismaUsersQueryRepository(prisma);
    for (const isBanned of [false, true]) {
      for (const deletedAt of [null, OCCURRED_AT]) {
        for (const isConfirmed of [false, true]) {
          const user = await prisma.user.create({
            data: { email: `${randomUUID()}@example.test`, isBanned, deletedAt, isConfirmed },
          });
          const expected = deletedAt
            ? UserAccessState.Deleted
            : isBanned
              ? UserAccessState.Blocked
              : UserAccessState.Active;
          expect(await query.findByUserId({ userId: user.id })).toBe(expected);
          expect(await repository.findById(user.id)).toEqual(
            deletedAt ? null : expect.objectContaining({ id: user.id, isBanned }),
          );
          expect(await repository.findByEmail(user.email)).toEqual(
            deletedAt ? null : expect.objectContaining({ id: user.id }),
          );
          expect(await normalRead.getUserById(user.id)).toEqual(
            deletedAt ? null : expect.objectContaining({ id: user.id }),
          );
          expect(await normalRead.getUserByEmail(user.email)).toEqual(
            deletedAt ? null : expect.objectContaining({ id: user.id }),
          );
          expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toEqual(user);
        }
      }
    }
  });

  it('reads state within a caller transaction without granting access or changing the record', async (): Promise<void> => {
    const user = await prisma.user.create({ data: { email: `${randomUUID()}@example.test` } });
    await expect(
      transactions.execute(async (transaction) => {
        await transaction.user.update({ where: { id: user.id }, data: { isBanned: true } });
        expect(await query.findByUserId({ userId: user.id, transaction })).toBe(
          UserAccessState.Blocked,
        );
        throw new Error('fixture-rollback');
      }),
    ).rejects.toThrow('fixture-rollback');
    expect(await query.findByUserId({ userId: user.id })).toBe(UserAccessState.Active);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toEqual(user);
    await expect(query.findByUserId({ userId: user.id, transaction: {} })).rejects.toMatchObject({
      code: 500,
    });
  });

  it('writes all eleven allowed action/outcome combinations and supports an absent target', async (): Promise<void> => {
    for (const result of VALID_RESULTS) {
      const targetUserId = result.outcome === 'NOT_FOUND' ? randomUUID() : USER_ID;
      const entry = { ...auditEntry(result), targetUserId };
      const { auditId } = await transactions.execute((transaction) =>
        writer.append({ entry, transaction }),
      );
      expect(
        await prisma.adminUserActionAudit.findUniqueOrThrow({ where: { id: auditId } }),
      ).toEqual({ id: auditId, ...entry, banReasonCode: null, banReasonText: null });
      if (result.outcome === 'NOT_FOUND')
        expect(await prisma.user.findUnique({ where: { id: targetUserId } })).toBeNull();
    }
    expect(await prisma.adminUserActionAudit.count()).toBe(11);
  });

  it('rejects incompatible actions/outcomes at the typed/runtime boundary, before INSERT', async (): Promise<void> => {
    // @ts-expect-error An UNBLOCK outcome cannot be paired with BLOCK.
    const incompatible: AdminUserActionAuditEntry = {
      ...auditEntry(),
      action: 'BLOCK',
      outcome: 'UNBLOCKED',
    };
    const invalid = [
      incompatible,
      { ...auditEntry(), action: 'UNKNOWN' },
      { ...auditEntry(), outcome: 'UNKNOWN' },
      { ...auditEntry({ action: 'DELETE', outcome: 'DELETED' }), outcome: 'USER_DELETED' },
      { ...auditEntry(), occurredAt: new Date('invalid') },
      { ...auditEntry(), targetUserId: '' },
      { ...auditEntry(), adminSessionId: createAdminToken() },
      { ...auditEntry(), adminSessionId: hashAdminToken('isolated-token') },
      { ...auditEntry(), password: 'isolated-secret-must-not-be-written' },
    ];
    for (const entry of invalid) {
      await expect(
        transactions.execute((transaction) =>
          writer.append({ entry: entry as AdminUserActionAuditEntry, transaction }),
        ),
      ).rejects.toMatchObject({ code: 400, message: 'Invalid admin audit entry' });
    }
    expect(await prisma.adminUserActionAudit.count()).toBe(0);
  });

  it('also enforces compatible pairs in PostgreSQL when the writer is bypassed', async (): Promise<void> => {
    await expect(prisma.$executeRaw`
      INSERT INTO "AdminUserActionAudit" ("id", "action", "targetUserId", "outcome", "occurredAt", "adminSessionId")
      VALUES (${randomUUID()}, 'DELETE', ${USER_ID}, 'BLOCKED', ${OCCURRED_AT}, ${ADMIN_SESSION_ID})
    `).rejects.toThrow();
    expect(await prisma.adminUserActionAudit.count()).toBe(0);
  });

  it('requires an explicit transaction and never falls back to root/autocommit writes', async (): Promise<void> => {
    for (const transaction of [undefined, null, {}, prisma]) {
      await expect(writer.append({ entry: auditEntry(), transaction })).rejects.toMatchObject({
        code: 500,
        message: 'Gateway transaction required',
      });
    }
    expect(await prisma.adminUserActionAudit.count()).toBe(0);
    const completed = await transactions.execute((transaction) => Promise.resolve(transaction));
    await expect(
      writer.append({ entry: auditEntry(), transaction: completed }),
    ).rejects.toMatchObject({ code: 500 });
    let rolledBack: unknown;
    await expect(
      transactions.execute((transaction) => {
        rolledBack = transaction;
        return Promise.reject(new Error('fixture-rollback'));
      }),
    ).rejects.toThrow('fixture-rollback');
    await expect(
      writer.append({ entry: auditEntry(), transaction: rolledBack }),
    ).rejects.toMatchObject({ code: 500 });
  });

  it('commits and rolls back audit together with User/Session changes in the existing transaction pattern', async (): Promise<void> => {
    const user = await prisma.user.create({ data: { email: `${randomUUID()}@example.test` } });
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        deviceId: randomUUID(),
        deviceName: 'isolated',
        ip: '192.0.2.1',
        iat: 1,
        exp: 2,
      },
    });
    const entry = { ...auditEntry(), targetUserId: user.id };
    // Fixture writes demonstrate atomicity, not an implementation of block/unblock/delete.
    await expect(
      transactions.execute(async (transaction) => {
        await transaction.user.update({ where: { id: user.id }, data: { isBanned: true } });
        await transaction.session.deleteMany({ where: { userId: user.id } });
        await writer.append({ entry, transaction });
        throw new Error('fixture-rollback');
      }),
    ).rejects.toThrow('fixture-rollback');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).isBanned).toBe(false);
    expect(await prisma.session.findUnique({ where: { id: session.id } })).not.toBeNull();
    expect(await prisma.adminUserActionAudit.count()).toBe(0);
    await expect(
      transactions.execute(async (transaction) => {
        await transaction.user.update({ where: { id: user.id }, data: { isBanned: true } });
        await transaction.session.deleteMany({ where: { userId: user.id } });
        return writer.append({
          entry: { ...entry, outcome: 'UNKNOWN' } as unknown as AdminUserActionAuditEntry,
          transaction,
        });
      }),
    ).rejects.toMatchObject({ code: 400 });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).isBanned).toBe(false);
    expect(await prisma.session.findUnique({ where: { id: session.id } })).not.toBeNull();
    expect(await prisma.adminUserActionAudit.count()).toBe(0);
    const { auditId } = await transactions.execute(async (transaction) => {
      await transaction.user.update({ where: { id: user.id }, data: { isBanned: true } });
      await transaction.session.deleteMany({ where: { userId: user.id } });
      return writer.append({ entry, transaction });
    });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).isBanned).toBe(true);
    expect(await prisma.session.findUnique({ where: { id: session.id } })).toBeNull();
    expect(await prisma.adminUserActionAudit.findUnique({ where: { id: auditId } })).toMatchObject(
      entry,
    );
  });

  it('retains audit across AdminSession revoke/replacement and physical session cleanup', async (): Promise<void> => {
    const sessions = new PrismaAdminSessionRepository(prisma);
    const originalToken = createAdminToken();
    const original = {
      id: randomUUID(),
      tokenHash: hashAdminToken(originalToken),
      createdAt: new Date('2026-10-18T12:00:00Z'),
      lastSeenAt: new Date('2026-10-18T12:00:00Z'),
      idleExpiresAt: new Date('2026-10-18T12:30:00Z'),
      absoluteExpiresAt: new Date('2026-10-18T20:00:00Z'),
      revokedAt: null,
    };
    await sessions.replace({ session: original, previousTokenHash: null });
    const entry = { ...auditEntry(), adminSessionId: original.id };
    const { auditId } = await transactions.execute((transaction) =>
      writer.append({ entry, transaction }),
    );
    await sessions.revoke({ tokenHash: original.tokenHash, now: OCCURRED_AT });
    expect(await prisma.adminUserActionAudit.findUnique({ where: { id: auditId } })).toMatchObject(
      entry,
    );
    await sessions.replace({
      session: { ...original, id: randomUUID(), tokenHash: hashAdminToken(createAdminToken()) },
      previousTokenHash: original.tokenHash,
    });
    await prisma.adminSession.delete({ where: { id: original.id } });
    expect(await prisma.adminUserActionAudit.findUnique({ where: { id: auditId } })).toMatchObject(
      entry,
    );
  });

  it('persists only audit fields/optional reason snapshot and does not deduplicate separate writer calls', async (): Promise<void> => {
    const first = await transactions.execute((transaction) =>
      writer.append({ entry: auditEntry(), transaction }),
    );
    const second = await transactions.execute((transaction) =>
      writer.append({ entry: auditEntry(), transaction }),
    );
    expect(second.auditId).not.toBe(first.auditId);
    expect(await prisma.adminUserActionAudit.count()).toBe(2);
    const columns = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'AdminUserActionAudit' ORDER BY ordinal_position`;
    expect(columns.map((column) => column.column_name)).toEqual([
      'id',
      'action',
      'targetUserId',
      'outcome',
      'occurredAt',
      'adminSessionId',
      'banReasonCode',
      'banReasonText',
    ]);
    const constraints = await prisma.$queryRaw<{ constraint_type: string }[]>`
      SELECT constraint_type FROM information_schema.table_constraints WHERE table_name = 'AdminUserActionAudit'`;
    expect(constraints.map((constraint) => constraint.constraint_type)).not.toContain(
      'FOREIGN KEY',
    );
  });

  it('does not accept isBanned through registration DTO or enforce it in current user login', async (): Promise<void> => {
    const pipe = new ValidationPipe(createValidationPipeOptions());
    const dto: RegisterUserDto = await pipe.transform(
      {
        username: 'fixture_user',
        email: `${randomUUID()}@example.test`,
        password: 'FixtureUser@2026',
        isBanned: true,
      },
      { type: 'body', metatype: RegisterUserDto },
    );
    expect(dto).not.toHaveProperty('isBanned');
    const passwords = new BcryptService();
    const user = await prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: await passwords.hashPassword(dto.password),
        isConfirmed: true,
        isBanned: true,
      },
    });
    const strategy = new LocalStrategy(
      new PrismaUsersRepository(prisma),
      passwords,
      new ProfileRepository(prisma),
    );
    expect(await strategy.validate(user.email, dto.password)).toEqual({
      userId: user.id,
      deviceId: '',
    });
  });
});
