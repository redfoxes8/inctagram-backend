import path from 'path';
import dotenv from 'dotenv';

// This runs before Nest modules are imported, so ConfigModule.forRoot()
// will see these env vars.
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';

if (!process.env.ENV_FILE_PATH) {
  process.env.ENV_FILE_PATH = path.resolve(__dirname, '../.env.test');
}

if (!process.env.PRISMA_CONFIG_PATH) {
  process.env.PRISMA_CONFIG_PATH = path.resolve(__dirname, '../src/core/prisma/prisma.config.ts');
}

/**
 * Make DB isolation compatible with parallel Jest workers.
 * We use separate Postgres schemas per worker: test_1, test_2, ...
 *
 * Prisma supports this via `?schema=...` (or `&schema=...` if query exists)
 * in DATABASE_URL / PRISMA_DB_URL for PostgreSQL.
 */
if (!process.env.TEST_DB_SCHEMA) {
  const workerId = process.env.JEST_WORKER_ID ?? '0';
  process.env.TEST_DB_SCHEMA = `test_${workerId}`;
}

// Load env early (especially for integration tests that call resetDb()).
dotenv.config({ path: process.env.ENV_FILE_PATH });

if (process.env.PRISMA_DB_URL) {
  try {
    const u = new URL(process.env.PRISMA_DB_URL);
    u.searchParams.set('schema', process.env.TEST_DB_SCHEMA);
    process.env.PRISMA_DB_URL = u.toString();
  } catch {
    // If PRISMA_DB_URL isn't a standard URL string, leave it as-is.
  }
}

if (process.env.PRISMA_DB_DIRECT_URL) {
  try {
    const u = new URL(process.env.PRISMA_DB_DIRECT_URL);
    u.searchParams.set('schema', process.env.TEST_DB_SCHEMA);
    process.env.PRISMA_DB_DIRECT_URL = u.toString();
  } catch {
    // ignore
  }
}
