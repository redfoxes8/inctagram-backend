import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/core/prisma/client';
import type { IsolatedAdminDatabase } from '../../main-gateway-service/test/superadmin/isolated-admin-database';

export const POST_PROJECTION_MIGRATION = '20261026120000_add_post_admin_user_projection';

// Reuse the existing disposable container. Never read a Post .env or reset an application database.
export function createIsolatedPostDatabase(input: {
  database: IsolatedAdminDatabase;
  beforeProjectionMigration: (sql: (statement: string) => void) => void;
}): PrismaClient {
  const container = input.database.container;
  if (!/^sa-admin-test-[0-9a-f-]+$/.test(container)) {
    throw new Error('Disposable PostgreSQL container required');
  }
  execFileSync(
    'docker',
    ['exec', container, 'psql', '-U', 'postgres', '-c', 'CREATE DATABASE posts_fixture'],
    {
      stdio: 'pipe',
    },
  );
  const port = execFileSync('docker', ['port', container, '5432/tcp'], { encoding: 'utf8' })
    .trim()
    .split(':')
    .at(-1);
  if (!port || !/^\d+$/.test(port)) throw new Error('Disposable PostgreSQL port missing');
  const connectionString = `postgresql://postgres:isolated-test-only@127.0.0.1:${port}/posts_fixture`;

  function sql(statement: string): void {
    execFileSync(
      'docker',
      [
        'exec',
        '-i',
        container,
        'psql',
        '-U',
        'postgres',
        '-d',
        'posts_fixture',
        '--single-transaction',
        '-v',
        'ON_ERROR_STOP=1',
      ],
      { input: statement, stdio: 'pipe' },
    );
  }
  function migrate(args: string[]): void {
    execFileSync(
      process.execPath,
      [
        join(process.cwd(), 'node_modules/prisma/build/index.js'),
        'migrate',
        ...args,
        '--config',
        'apps/micro-post-service/prisma/prisma.config.ts',
      ],
      {
        // This NODE_ENV has no service env file. CLI receives ONLY this disposable DB URL.
        env: {
          ...process.env,
          NODE_ENV: 'post-projection-isolated',
          DATABASE_URL: connectionString,
        },
        stdio: 'pipe',
      },
    );
  }
  const directory = join(process.cwd(), 'apps/micro-post-service/prisma/migrations');
  const names = readdirSync(directory)
    .filter((name) => /^\d/.test(name))
    .sort();
  if (names.at(-1) !== POST_PROJECTION_MIGRATION)
    throw new Error('Unexpected Post migration chain');
  for (const name of names) {
    if (name === POST_PROJECTION_MIGRATION) {
      input.beforeProjectionMigration(sql);
      migrate(['deploy']);
    } else {
      // Explicit previous-schema baseline, not a clean migrate deploy of the complete history.
      sql(readFileSync(join(directory, name, 'migration.sql'), 'utf8'));
      migrate(['resolve', '--applied', name]);
    }
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
