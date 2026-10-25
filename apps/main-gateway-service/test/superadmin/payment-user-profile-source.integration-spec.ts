import { Test, type TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { IsolatedAdminDatabase } from './isolated-admin-database';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { ITransactionManager } from '../../src/common/interfaces/transaction-manager.interface';
import { SuperadminModerationModule } from '../../src/modules/superadmin/superadmin-moderation.module';
import { UserStateAuditModule } from '../../src/modules/users/user-state-audit.module';
import {
  RegisterUserCommand,
  RegisterUserUseCase,
} from '../../src/modules/auth/application/use-cases/register-user.use-case';
import {
  GoogleLoginCommand,
  GoogleLoginUseCase,
} from '../../src/modules/auth/application/use-cases/google-login.use-case';
import {
  UpdateProfileCommand,
  UpdateProfileUseCase,
} from '../../src/modules/users/application/use-cases/update-profile.use-case';
import {
  ConfirmAvatarCommand,
  ConfirmAvatarHandler,
} from '../../src/modules/users/application/commands/confirm-avatar.command';
import {
  DeleteAvatarCommand,
  DeleteAvatarHandler,
} from '../../src/modules/users/application/commands/delete-avatar.command';
import { IUsersRepository } from '../../src/modules/users/domain/interfaces/users.repository.interface';
import { IProfileRepository } from '../../src/modules/users/domain/interfaces/user-profile.repository.interface';
import { PrismaUsersRepository } from '../../src/modules/users/infrastructure/users.repository';
import { ProfileRepository } from '../../src/modules/users/infrastructure/profile.repository';
import { ProfileEntity } from '../../src/modules/users/domain/profile.entity';
import { UserEntity } from '../../src/modules/users/domain/user.entity';
import { IPasswordService } from '../../src/modules/users/application/interfaces/password.service.interface';
import { BcryptService } from '../../src/modules/users/infrastructure/password.service';
import { IEmailAdapter } from '../../src/modules/auth/application/interfaces/email.adapter.interface';
import { IEmailConfirmationRepository } from '../../src/modules/auth/domain/interfaces/email-confirmation.repository.interface';
import { EmailConfirmationRepositoryImplementation } from '../../src/modules/auth/infrastructure/email-confirmation.repository';
import { IOAuthAccountsRepository } from '../../src/modules/auth/domain/interfaces/oauth-accounts.repository.interface';
import { PrismaOAuthAccountsRepository } from '../../src/modules/auth/infrastructure/oauth-accounts.repository';
import { IGoogleAuthAdapter } from '../../src/modules/auth/application/interfaces/google-auth.adapter.interface';
import {
  IJwtService,
  type TokenPayload,
} from '../../src/modules/auth/application/interfaces/jwt.service.interface';
import { ISessionsRepository } from '../../src/modules/sessions/domain/interfaces/sessions.repository.interface';
import { PrismaSessionsRepository } from '../../src/modules/sessions/infrastructure/sessions.repository';
import { FileGrpcClient } from '../../src/modules/files/infrastructure/file-grpc.client';
import { CoreConfig } from '../../../../libs/common/src/core.config';
import { FileStatus, FileType } from '../../../../libs/contracts/src/generated/file';
import { ModerateUserUseCase } from '../../src/modules/users/application/commands/moderate-user.usecase';
import { UserModerationRepository } from '../../src/modules/users/domain/interfaces/user-moderation.repository';
import {
  parsePaymentUserProfileChangedV1,
  type PaymentUserProfileChangedV1,
} from '../../../../libs/contracts/src/events/payment-user-profile-changed-v1.event';
import { writePaymentUserProfileSnapshot } from '../../src/modules/users/infrastructure/payment-user-profile-snapshot.writer';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe('P1b real source use cases + repositories + isolated PostgreSQL', () => {
  jest.setTimeout(120000);
  const database = new IsolatedAdminDatabase();
  let prisma: PrismaService;
  let peer: PrismaService;
  let module: TestingModule;
  let users: IUsersRepository;
  let profiles: IProfileRepository;
  let transactions: ITransactionManager;
  let payload: TokenPayload | null = null;
  let fileOwner = '';
  const google = { exchangeCodeForProfile: jest.fn() };
  const file = { getFileStatus: jest.fn() };
  const jwt = {
    createTokens(userId: string, deviceId: string): { accessToken: string; refreshToken: string } {
      const now = Math.floor(Date.now() / 1000);
      payload = { userId, deviceId, tokenType: 'REFRESH', iat: now, exp: now + 3600 };
      return { accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh' };
    },
    getPayload: (): Promise<TokenPayload | null> => Promise.resolve(payload),
  };

  async function register(): Promise<{ userId: string; username: string }> {
    const suffix = randomUUID().slice(0, 8);
    const dto = {
      username: 'user_' + suffix,
      email: suffix + '@fixture.test',
      password: 'Fixture-Source1!',
    };
    const code = await module.get(RegisterUserUseCase).execute(new RegisterUserCommand(dto));
    const user = await prisma.user.findUniqueOrThrow({ where: { email: dto.email } });
    expect(user.isConfirmed).toBe(false);
    expect(
      await module
        .get<IPasswordService>(IPasswordService)
        .comparePassword(dto.password, user.passwordHash!),
    ).toBe(true);
    expect(
      (await prisma.emailConfirmation.findUniqueOrThrow({ where: { userId: user.id } }))
        .confirmationCode,
    ).toBe(code);
    return { userId: user.id, username: dto.username };
  }
  async function events(userId: string): Promise<PaymentUserProfileChangedV1[]> {
    const rows = await prisma.paymentUserProfileOutbox.findMany({
      where: { userId },
      orderBy: { sourceVersion: 'asc' },
    });
    return rows.map((row) => {
      const event = parsePaymentUserProfileChangedV1(row.payload);
      expect(event.eventId).toBe(row.id);
      expect(event.sourceVersion).toBe(row.sourceVersion.toString());
      expect(row.publishedAt).toBeNull();
      expect(Object.keys(event).sort()).toEqual(
        [
          'eventId',
          'eventType',
          'isDeleted',
          'occurredAt',
          'profileExists',
          'schemaVersion',
          'sourceVersion',
          'userId',
          'username',
        ].sort(),
      );
      return event;
    });
  }
  async function rename(input: {
    userId: string;
    username: string;
    firstName?: string;
  }): Promise<void> {
    await module.get(UpdateProfileUseCase).execute(
      new UpdateProfileCommand(
        {
          username: input.username,
          firstName: input.firstName ?? 'Fresh',
          lastName: 'Name',
          dateOfBirth: null,
          country: 'country',
          city: 'city',
          aboutMe: 'about',
        },
        input.userId,
      ),
    );
  }
  async function moderate(input: {
    userId: string;
    action: 'BLOCK' | 'UNBLOCK' | 'DELETE';
  }): Promise<string> {
    const result = await module
      .get(ModerateUserUseCase)
      .execute({ ...input, adminSessionId: randomUUID() });
    return result.outcome;
  }
  function googleLogin(): Promise<{ accessToken: string; refreshToken: string }> {
    return module.get(GoogleLoginUseCase).execute(
      new GoogleLoginCommand('synthetic-code', 'google_fixture', {
        deviceId: randomUUID(),
        deviceName: 'fixture',
        ip: '192.0.2.1',
      }),
    );
  }

  beforeAll(async () => {
    await database.start();
    prisma = database.client();
    peer = database.client();
    module = await Test.createTestingModule({
      imports: [SuperadminModerationModule, UserStateAuditModule],
      providers: [
        RegisterUserUseCase,
        GoogleLoginUseCase,
        UpdateProfileUseCase,
        ConfirmAvatarHandler,
        DeleteAvatarHandler,
        { provide: IUsersRepository, useClass: PrismaUsersRepository },
        { provide: IProfileRepository, useClass: ProfileRepository },
        { provide: IPasswordService, useClass: BcryptService },
        {
          provide: IEmailConfirmationRepository,
          useClass: EmailConfirmationRepositoryImplementation,
        },
        { provide: IOAuthAccountsRepository, useClass: PrismaOAuthAccountsRepository },
        { provide: ISessionsRepository, useClass: PrismaSessionsRepository },
        { provide: CoreConfig, useValue: { env: 'test' } },
        { provide: IEmailAdapter, useValue: { sendRegistrationCode: jest.fn() } },
        { provide: IGoogleAuthAdapter, useValue: google },
        { provide: IJwtService, useValue: jwt },
        { provide: FileGrpcClient, useValue: file },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    users = module.get(IUsersRepository);
    profiles = module.get(IProfileRepository);
    transactions = module.get(ITransactionManager);
  });
  beforeEach(async () => {
    jest.restoreAllMocks();
    await prisma.user.deleteMany();
    await prisma.paymentUserProfileOutbox.deleteMany();
    await prisma.adminUserActionAudit.deleteMany();
    await prisma.userAccessRevokeOutbox.deleteMany();
    await prisma.outboxEvent.deleteMany();
    google.exchangeCodeForProfile.mockResolvedValue({
      email: 'google@fixture.test',
      sub: 'fixture-sub',
      email_verified: true,
    });
    file.getFileStatus.mockImplementation(({ fileId }: { fileId: string }) =>
      Promise.resolve({
        file: {
          id: fileId,
          ownerId: fileOwner,
          fileType: FileType.AVATAR,
          status: FileStatus.UPLOADED,
          fileUrl: 'https://files.example.test/' + fileId,
        },
      }),
    );
  });
  afterAll(async () => {
    await module?.close();
    await database.stop();
  });

  it('registers User/Profile/confirmation with committed v1+v2 snapshots and unchanged response/hash semantics', async () => {
    const { userId, username } = await register();
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).paymentProfileVersion,
    ).toBe(2n);
    expect(await events(userId)).toMatchObject([
      { sourceVersion: '1', username: null, profileExists: false, isDeleted: false },
      { sourceVersion: '2', username, profileExists: true, isDeleted: false },
    ]);
  });

  it('Google create uses the same tx; repeat/link/email changes produce no extra projection events', async () => {
    await googleLogin();
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'google@fixture.test' } });
    expect(user.paymentProfileVersion).toBe(2n);
    expect(await events(user.id)).toMatchObject([
      { sourceVersion: '1', profileExists: false },
      { sourceVersion: '2', username: 'google_fixture' },
    ]);
    await googleLogin();
    google.exchangeCodeForProfile.mockResolvedValue({
      email: 'changed@fixture.test',
      sub: 'fixture-sub',
      email_verified: true,
    });
    await googleLogin();
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(3);
    expect(await events(user.id)).toHaveLength(2);
    google.exchangeCodeForProfile.mockResolvedValue({
      email: 'changed@fixture.test',
      sub: 'linked-sub',
      email_verified: true,
    });
    await googleLogin();
    expect(await prisma.oAuthAccount.count({ where: { userId: user.id } })).toBe(2);
    expect(await events(user.id)).toHaveLength(2);
  });

  it('supports standalone profile creation and only versions actual username changes', async () => {
    const user = await users.save(UserEntity.createNew('profileless@fixture.test', null));
    await profiles.save(ProfileEntity.createNew(user.id, 'initial_fixture'));
    await rename({ userId: user.id, username: 'renamed_fixture' });
    await rename({ userId: user.id, username: 'renamed_fixture', firstName: 'Changed' });
    expect((await prisma.profile.findUniqueOrThrow({ where: { userId: user.id } })).firstName).toBe(
      'Changed',
    );
    expect(await events(user.id)).toMatchObject([
      { sourceVersion: '1', username: null },
      { sourceVersion: '2', username: 'initial_fixture' },
      { sourceVersion: '3', username: 'renamed_fixture' },
    ]);
    const stale = await users.findById(user.id);
    stale!.confirmEmail();
    await users.update(stale!);
    await moderate({ userId: user.id, action: 'BLOCK' });
    await moderate({ userId: user.id, action: 'UNBLOCK' });
    expect(await events(user.id)).toHaveLength(3);
  });

  it('deletes atomically with audit/revoke, emits one tombstone and never a new live snapshot', async () => {
    const { userId } = await register();
    await prisma.session.create({
      data: {
        userId,
        deviceId: randomUUID(),
        deviceName: 'fixture',
        ip: '192.0.2.1',
        iat: 1,
        exp: 2,
      },
    });
    expect(await moderate({ userId, action: 'DELETE' })).toBe('DELETED');
    expect(await moderate({ userId, action: 'DELETE' })).toBe('ALREADY_DELETED');
    expect((await events(userId))[2]).toMatchObject({
      sourceVersion: '3',
      username: null,
      isDeleted: true,
      profileExists: true,
    });
    expect(await events(userId)).toHaveLength(3);
    expect(await prisma.session.count({ where: { userId, deletedAt: null } })).toBe(0);
    expect(await prisma.userAccessRevokeOutbox.count({ where: { userId } })).toBe(1);
    expect(await prisma.adminUserActionAudit.count({ where: { targetUserId: userId } })).toBe(2);
    await expect(rename({ userId, username: 'resurrected' })).rejects.toMatchObject({ code: 404 });
    expect(await events(userId)).toHaveLength(3);
  });

  it('rolls an entire registration and a delete back when profile outbox fails', async () => {
    const registered = await register();
    const before = await prisma.user.findUniqueOrThrow({ where: { id: registered.userId } });
    await prisma.session.create({
      data: {
        userId: registered.userId,
        deviceId: randomUUID(),
        deviceName: 'fixture',
        ip: '192.0.2.1',
        iat: 1,
        exp: 2,
      },
    });
    database.sql(
      `ALTER TABLE "PaymentUserProfileOutbox" ADD CONSTRAINT "fixture_source_failure" CHECK("sourceVersion" <> 2 AND "userId" <> '${registered.userId}') NOT VALID`,
    );
    try {
      await expect(
        module.get(RegisterUserUseCase).execute(
          new RegisterUserCommand({
            username: 'failed_fixture',
            email: 'failed@fixture.test',
            password: 'Fixture-Source1!',
          }),
        ),
      ).rejects.toThrow();
      expect(await prisma.user.count({ where: { email: 'failed@fixture.test' } })).toBe(0);
      expect(await prisma.profile.count({ where: { username: 'failed_fixture' } })).toBe(0);
      expect(await prisma.emailConfirmation.count()).toBe(1);
      await expect(moderate({ userId: registered.userId, action: 'DELETE' })).rejects.toThrow();
      expect(await prisma.user.findUnique({ where: { id: registered.userId } })).toEqual(before);
      expect(
        await prisma.session.count({ where: { userId: registered.userId, deletedAt: null } }),
      ).toBe(1);
      expect(await prisma.adminUserActionAudit.count()).toBe(0);
      expect(await prisma.userAccessRevokeOutbox.count()).toBe(0);
    } finally {
      database.sql(
        'ALTER TABLE "PaymentUserProfileOutbox" DROP CONSTRAINT "fixture_source_failure"',
      );
    }
    expect(await events(registered.userId)).toHaveLength(2);
  });

  it('rejects BIGINT overflow safely and rolls the rename back', async () => {
    const { userId, username } = await register();
    await prisma.user.update({
      where: { id: userId },
      data: { paymentProfileVersion: 9223372036854775807n },
    });
    await expect(rename({ userId, username: 'overflow_name' })).rejects.toMatchObject({
      code: 503,
      message: 'User profile snapshot unavailable',
    });
    expect((await prisma.profile.findUniqueOrThrow({ where: { userId } })).username).toBe(username);
    expect(await events(userId)).toHaveLength(2);
    await expect(
      writePaymentUserProfileSnapshot({ userId, transaction: prisma }),
    ).rejects.toMatchObject({ code: 500 });
  });

  it('avatar handlers read current state under lock; a stale entity cannot overwrite fresh profile fields', async () => {
    const { userId } = await register();
    fileOwner = userId;
    const stale = await profiles.findByUserId(userId);
    await rename({ userId, username: 'current_fixture', firstName: 'Fresh' });
    stale!.setAvatar('legacy-file', 'https://files.example.test/legacy');
    await transactions.execute((transaction) =>
      profiles.updateAvatar({
        userId,
        avatarFileId: stale!.avatarFileId,
        avatarUrl: stale!.avatarUrl,
        updatedAt: stale!.updatedAt,
        transaction,
      }),
    );
    await module
      .get(ConfirmAvatarHandler)
      .execute(new ConfirmAvatarCommand({ userId, fileId: 'new-file' }));
    await module.get(DeleteAvatarHandler).execute(new DeleteAvatarCommand({ userId }));
    expect(await prisma.profile.findUnique({ where: { userId } })).toMatchObject({
      username: 'current_fixture',
      firstName: 'Fresh',
      avatarFileId: null,
      avatarUrl: null,
    });
    expect(await prisma.outboxEvent.count()).toBe(2);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).paymentProfileVersion,
    ).toBe(3n);
    expect(await events(userId)).toHaveLength(3);
    // Preserve file owner/type/status rejection before any avatar DB write.
    fileOwner = randomUUID();
    await expect(
      module
        .get(ConfirmAvatarHandler)
        .execute(new ConfirmAvatarCommand({ userId, fileId: 'forbidden-file' })),
    ).rejects.toMatchObject({ code: 403 });
  });

  it.each(['rename', 'delete'] as const)(
    'serializes %s first against the other command, with tombstone last',
    async (firstKind) => {
      const { userId } = await register();
      const locked = deferred();
      const release = deferred();
      if (firstKind === 'rename') {
        const original = profiles.lockByUserId.bind(profiles);
        let held = false;
        jest.spyOn(profiles, 'lockByUserId').mockImplementation(async (input) => {
          const profile = await original(input);
          if (!held) {
            held = true;
            locked.resolve();
            await release.promise;
          }
          return profile;
        });
      } else {
        const repository = module.get(UserModerationRepository);
        const original = repository.lockUser.bind(repository);
        jest.spyOn(repository, 'lockUser').mockImplementation(async (input) => {
          const user = await original(input);
          locked.resolve();
          await release.promise;
          return user;
        });
      }
      const doRename = (): Promise<void> => rename({ userId, username: 'racing_fixture' });
      const doDelete = (): Promise<string> => moderate({ userId, action: 'DELETE' });
      const first = firstKind === 'rename' ? doRename() : doDelete();
      await Promise.race([locked.promise, first]);
      const second = (firstKind === 'rename' ? doDelete() : doRename()).then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      try {
        const deadline = Date.now() + 5000;
        let observed = false;
        while (Date.now() < deadline) {
          const rows = await peer.$queryRaw<
            { count: number }[]
          >`SELECT count(*)::int AS count FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%FROM "User" WHERE "id"%'`;
          if (rows[0].count > 0) {
            observed = true;
            break;
          }
        }
        expect(observed).toBe(true);
      } finally {
        release.resolve();
      }
      await first;
      const next = await second;
      if (firstKind === 'delete') expect(next).toMatchObject({ error: { code: 404 } });
      else expect(next).toEqual({ value: 'DELETED' });
      const emitted = await events(userId);
      expect(emitted[emitted.length - 1]).toMatchObject({ isDeleted: true, username: null });
      expect(emitted.filter((event) => event.isDeleted)).toHaveLength(1);
      expect(emitted).toHaveLength(firstKind === 'rename' ? 4 : 3);
    },
  );
});
