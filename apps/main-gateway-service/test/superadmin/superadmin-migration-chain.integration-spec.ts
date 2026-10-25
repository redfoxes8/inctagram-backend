import { IsolatedAdminDatabase } from './isolated-admin-database';

describe('SA-GQL-09 official migrate deploy for AdminSession -> state/audit -> revoke outbox', () => {
  jest.setTimeout(120000);
  const database = new IsolatedAdminDatabase();
  afterAll(async () => database.stop());

  it('deploys new chain over explicitly SQL-applied/resolved legacy baseline, preserving previous fixtures', async () => {
    await database.start({
      deployFromMigration: '20261018120000_add_admin_sessions',
      beforeMigration: ({ name, database: isolated }) => {
        if (name === '20261018120000_add_admin_sessions') {
          isolated.sql(`
            UPDATE "User" SET "isConfirmed"=true, "accountType"='BUSINESS' WHERE "id"='migration-preserved-user';
            INSERT INTO "Profile" ("id","userId","username","firstName","updatedAt") VALUES ('chain-profile','migration-preserved-user','chain-fixture','Preserved',now());
            INSERT INTO "Session" ("id","userId","deviceId","deviceName","ip","iat","exp","updatedAt") VALUES ('chain-session','migration-preserved-user','chain-device','fixture','127.0.0.1',100,200,now());
          `);
        }
      },
    });
    const prisma = database.client();
    expect(
      await prisma.user.findUnique({ where: { id: 'migration-preserved-user' } }),
    ).toMatchObject({
      email: 'preserved@example.test',
      isConfirmed: true,
      accountType: 'BUSINESS',
      isBanned: false,
      deletedAt: null,
    });
    expect(await prisma.profile.findUnique({ where: { id: 'chain-profile' } })).toMatchObject({
      firstName: 'Preserved',
      username: 'chain-fixture',
    });
    expect(await prisma.session.findUnique({ where: { id: 'chain-session' } })).toMatchObject({
      deviceId: 'chain-device',
      iat: 100,
      exp: 200,
      deletedAt: null,
    });
    expect(await prisma.adminSession.count()).toBe(0);
    expect(await prisma.adminUserActionAudit.count()).toBe(0);
    expect(await prisma.userAccessRevokeOutbox.count()).toBe(0);
    const migrations = await prisma.$queryRaw<
      { migration_name: string; finished: boolean }[]
    >`SELECT migration_name, finished_at IS NOT NULL AS finished FROM "_prisma_migrations" WHERE migration_name >= '20261018120000' ORDER BY migration_name`;
    expect(migrations).toEqual([
      { migration_name: '20261018120000_add_admin_sessions', finished: true },
      { migration_name: '20261018130000_add_user_state_audit', finished: true },
      { migration_name: '20261018140000_add_user_access_revoke_outbox', finished: true },
      { migration_name: '20261025120000_add_user_ban_reasons', finished: true },
      { migration_name: '20261025130000_add_payment_user_profile_outbox', finished: true },
    ]);
  });
});
