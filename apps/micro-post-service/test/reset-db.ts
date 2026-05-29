import { execSync } from 'child_process';
import path from 'path';
// fs intentionally unused here; keep imports minimal
import { Client } from 'pg';
import fs from 'fs';

// Simple filesystem lock to serialize migrations/resets across parallel test processes.
const LOCK_DIR = path.resolve(process.cwd(), 'tmp');
const LOCK_FILE = path.join(LOCK_DIR, 'test-migrate.lock');

async function acquireFsLock(timeoutMs = 2 * 60 * 1000, retryMs = 100) {
  if (!fs.existsSync(LOCK_DIR)) fs.mkdirSync(LOCK_DIR, { recursive: true });
  const start = Date.now();
  while (true) {
    try {
      const fd = fs.openSync(LOCK_FILE, 'wx');
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return;
    } catch (err) {
      if ((Date.now() - start) > timeoutMs) {
        throw new Error('Timeout acquiring test migrate lock');
      }
      // wait
      await new Promise((r) => setTimeout(r, retryMs));
    }
  }
}

function releaseFsLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
  } catch (err) {
    // ignore
  }
}

export async function prepareTestDatabase(options: { prismaConfigPath?: string } = {}) {
  // ensure DATABASE_URL available via jest.env-setup or explicit overrides
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required for resetDb');

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    // Simple connectivity check
    await client.query('SELECT 1');

    // Run migrations using prisma migrate deploy
    const prismaConfigPath =
      options.prismaConfigPath ||
      path.resolve(process.cwd(), 'apps/micro-post-service/prisma/prisma.config.ts');
    try {
      // serialize migrations across parallel test processes using a simple FS lock
      await acquireFsLock();
      try {
        execSync(`pnpm -s prisma migrate deploy --config "${prismaConfigPath}"`, {
          stdio: 'inherit',
          env: { ...process.env, NODE_ENV: 'test' },
        });
      } finally {
        releaseFsLock();
      }
    } catch (err) {
      // If migrations fail, surface the error but do not leave the client open
      throw err;
    }

    // Deterministic truncate of all non-prisma tables in the current search_path
    // Serialize truncation with migrations across processes
    await acquireFsLock();
    try {
      const tablesRes = await client.query<{ tablename: string }>(
        `SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename NOT LIKE '_prisma_%';`,
      );
      const names = tablesRes.rows.map((r) => `"${r.tablename}"`).join(',');
      if (names.length) {
        await client.query(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE;`);
      }
    } finally {
      releaseFsLock();
    }
  } finally {
    await client.end();
  }
}

export async function resetTestDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required for resetTestDatabase');

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await acquireFsLock();
    try {
      // Deterministic truncate of all non-prisma tables in the current search_path
      const tablesRes = await client.query<{ tablename: string }>(
        `SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename NOT LIKE '_prisma_%';`,
      );
      const names = tablesRes.rows.map((r) => `"${r.tablename}"`).join(',');
      if (names.length) {
        await client.query(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE;`);
      }
    } finally {
      releaseFsLock();
    }
  } finally {
    await client.end();
  }
}
