import dotenv from 'dotenv';
import { execSync } from 'child_process';
import path from 'path';
import { Client } from 'pg';
import fs from 'fs';

const migratedSchemas = new Set<string>();

type ResetDbOptions = {
  /**
   * Path to prisma.config.ts (preferred in Prisma 7+).
   * Example: apps/main-gateway-service/src/core/prisma/prisma.config.ts
   */
  prismaConfigPath?: string;

  /**
   * Path to env file that contains PRISMA_DB_URL (and optionally PRISMA_DB_DIRECT_URL).
   */
  envFilePath?: string;

  /**
   * DB schema to reset (worker-isolated). If omitted, uses TEST_DB_SCHEMA or 'public'.
   */
  schema?: string;
};

function parseSslFromConnectionString(connectionString: string) {
  try {
    const u = new URL(connectionString);
    const sslmode = u.searchParams.get('sslmode');
    if (sslmode === 'require') {
      return { rejectUnauthorized: false } as const;
    }
  } catch {
    // ignore
  }
  return undefined;
}

function requireConnectionString(): string {
  const direct = process.env.PRISMA_DB_DIRECT_URL;
  const pooled = process.env.PRISMA_DB_URL;
  return direct || pooled || '';
}

async function acquireFileLock(lockPath: string, timeoutMs = 60_000): Promise<() => void> {
  const start = Date.now();

  while (true) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      return () => {
        try {
          fs.closeSync(fd);
        } finally {
          try {
            fs.unlinkSync(lockPath);
          } catch {
            // ignore
          }
        }
      };
    } catch (e: any) {
      if (e?.code !== 'EEXIST') throw e;

      try {
        const stats = fs.statSync(lockPath);
        const ageMs = Date.now() - stats.mtimeMs;

        // Previous crashed test runs can leave an orphaned lock file behind.
        if (ageMs > timeoutMs) {
          fs.unlinkSync(lockPath);
          continue;
        }
      } catch {
        // ignore races while another process removes/recreates the lock
      }

      if (Date.now() - start > timeoutMs) {
        throw new Error(`Timed out waiting for lock file: ${lockPath}`);
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}

function ensureEnvLoaded(envFilePath?: string) {
  if (process.env.PRISMA_DB_URL || process.env.PRISMA_DB_DIRECT_URL) return;

  const p =
    envFilePath?.trim() ||
    process.env.ENV_FILE_PATH?.trim() ||
    path.resolve(process.cwd(), '.env.test');

  dotenv.config({ path: path.isAbsolute(p) ? p : path.resolve(process.cwd(), p) });
}

function requirePrismaConfigPath(explicit?: string): string {
  const p = explicit?.trim() || process.env.PRISMA_CONFIG_PATH?.trim();
  if (!p) {
    throw new Error(
      'PRISMA_CONFIG_PATH is not set. Provide it via ResetDbOptions.prismaConfigPath or env var PRISMA_CONFIG_PATH.',
    );
  }
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

async function recreateSchema(client: Client, schema: string) {
  if (schema === 'public') {
    throw new Error('Refusing to recreate public schema in resetDb().');
  }

  await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE;`);
  await client.query(`CREATE SCHEMA "${schema}";`);
  await client.query(`SET search_path TO "${schema}"`);
}

export async function resetDb(options: ResetDbOptions = {}): Promise<void> {
  ensureEnvLoaded(options.envFilePath);

  const schema = options.schema || process.env.TEST_DB_SCHEMA || 'public';
  const connectionString = requireConnectionString();
  if (!connectionString) {
    throw new Error('Neither PRISMA_DB_DIRECT_URL nor PRISMA_DB_URL is set (needed for resetDb).');
  }

  const client = new Client({
    connectionString,
    ssl: parseSslFromConnectionString(connectionString),
  });

  await client.connect();
  try {
    if (schema !== 'public') {
      await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}";`);
    }

    await client.query(`SET search_path TO "${schema}"`);

    const migrationKey = `${connectionString}::${schema}`;

    // Run migrations once per process+schema. Repeated deploys inside every test hook are too slow.
    if (!migratedSchemas.has(migrationKey)) {
      const release = await acquireFileLock(
        path.resolve(process.cwd(), '.jest-prisma-migrate.lock'),
        120_000,
      );
      try {
        const prismaConfigPath = requirePrismaConfigPath(options.prismaConfigPath);
        const execOptions = {
          stdio: 'inherit' as const,
          env: {
            ...process.env,
            // Prisma config file loads env by NODE_ENV; for tests we want `.env.test`
            // that was already loaded by jest.env-setup.ts.
            NODE_ENV: 'test',
          },
        };

        try {
          execSync(`pnpm -s prisma migrate deploy --config "${prismaConfigPath}"`, execOptions);
        } catch {
          // Tests should recover from a previously broken worker schema instead of requiring manual repair.
          await recreateSchema(client, schema);
          execSync(`pnpm -s prisma migrate deploy --config "${prismaConfigPath}"`, execOptions);
        }

        migratedSchemas.add(migrationKey);
      } finally {
        release();
      }
    }

    const tablesAfter = await client.query<{ tablename: string }>(
      `SELECT tablename
       FROM pg_tables
       WHERE schemaname = $1 AND tablename NOT LIKE '_prisma_%';`,
      [schema],
    );

    const names = tablesAfter.rows.map((r) => `"${schema}"."${r.tablename}"`).join(',');
    if (names.length) {
      await client.query(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE;`);
    }
  } finally {
    await client.end();
  }
}
