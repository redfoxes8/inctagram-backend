import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../micro-payment-service/src/core/prisma/client';
import type { IsolatedAdminDatabase } from './isolated-admin-database';

// Separate logical Payment database in the existing disposable PostgreSQL container.
// Never reads service URLs, env files, shared databases or provider credentials.
export function createIsolatedPaymentDatabase(database: IsolatedAdminDatabase): PrismaClient {
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
  const migrations = join(process.cwd(), 'apps/micro-payment-service/src/core/prisma/migrations');
  for (const name of readdirSync(migrations)
    .filter((name) => /^\d/.test(name))
    .sort()) {
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
      {
        input: readFileSync(join(migrations, name, 'migration.sql'), 'utf8'),
        stdio: 'pipe',
      },
    );
  }
  const port = execFileSync('docker', ['port', database.container, '5432/tcp'], {
    encoding: 'utf8',
  })
    .trim()
    .split(':')
    .at(-1);
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: `postgresql://postgres:isolated-test-only@127.0.0.1:${port}/payments_fixture`,
    }),
  });
}
