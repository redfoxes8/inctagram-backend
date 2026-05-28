import { execSync } from 'child_process';
import path from 'path';
// fs intentionally unused here; keep imports minimal
import { Client } from 'pg';

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
      execSync(`pnpm -s prisma migrate deploy --config "${prismaConfigPath}"`, {
        stdio: 'inherit',
        env: { ...process.env, NODE_ENV: 'test' },
      });
    } catch (err) {
      // If migrations fail, surface the error but do not leave the client open
      throw err;
    }

    // Deterministic truncate of all non-prisma tables in the current search_path
    const tablesRes = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename NOT LIKE '_prisma_%';`,
    );
    const names = tablesRes.rows.map((r) => `"${r.tablename}"`).join(',');
    if (names.length) {
      await client.query(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE;`);
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
    // Deterministic truncate of all non-prisma tables in the current search_path
    const tablesRes = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename NOT LIKE '_prisma_%';`,
    );
    const names = tablesRes.rows.map((r) => `"${r.tablename}"`).join(',');
    if (names.length) {
      await client.query(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE;`);
    }
  } finally {
    await client.end();
  }
}
