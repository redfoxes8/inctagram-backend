import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../micro-payment-service/src/core/prisma/client';
import type { IsolatedAdminDatabase } from './isolated-admin-database';

// Separate logical Payment database in the existing disposable PostgreSQL container.
// Never reads service URLs, env files, shared databases or provider credentials.
export function createIsolatedPaymentDatabase(
  database: IsolatedAdminDatabase,
  input: {
    beforeMigration?: (input: { name: string; sql: (statement: string) => void }) => void;
    deployLastWithPrisma?: boolean;
  } = {},
): PrismaClient {
  execFileSync(
    'docker',
    [
      'exec',
      database.container,
      'psql',
      '-U',
      'postgres',
      '-c',
      'CREATE DATABASE payments_fixture',
    ],
    { stdio: 'pipe' },
  );
  const port = execFileSync('docker', ['port', database.container, '5432/tcp'], {
    encoding: 'utf8',
  })
    .trim()
    .split(':')
    .at(-1);
  const connectionString = `postgresql://postgres:isolated-test-only@127.0.0.1:${port}/payments_fixture`;
  function sql(statement: string): void {
    execFileSync(
      'docker',
      [
        'exec',
        '-i',
        database.container,
        'psql',
        '-U',
        'postgres',
        '-d',
        'payments_fixture',
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
        'apps/micro-payment-service/src/core/prisma/prisma.config.ts',
      ],
      {
        env: { ...process.env, NODE_ENV: 'test', PRISMA_DB_URL_DIRECT: connectionString },
        stdio: 'pipe',
      },
    );
  }
  const migrations = join(process.cwd(), 'apps/micro-payment-service/src/core/prisma/migrations');
  const names = readdirSync(migrations)
    .filter((name) => /^\d/.test(name))
    .sort();
  for (const name of names) {
    input.beforeMigration?.({ name, sql });
    if (input.deployLastWithPrisma && name === names.at(-1)) {
      migrate(['deploy']);
    } else {
      sql(readFileSync(join(migrations, name, 'migration.sql'), 'utf8'));
      // Explicit fixture baseline, not a claim of clean deploy of the historical migrations.
      if (input.deployLastWithPrisma) migrate(['resolve', '--applied', name]);
    }
  }
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
    }),
  });
}
