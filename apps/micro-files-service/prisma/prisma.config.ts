import dotenv from 'dotenv';
import { defineConfig } from 'prisma/config';

const env = process.env.NODE_ENV || 'development';
dotenv.config({ path: `apps/micro-files-service/.env.${env}` });

// Проверяем, запущены ли мы через Prisma CLI (например, для миграций)
const isCLI =
  process.env.PRISMA_CLI_QUERY_ENGINE_TYPE !== undefined ||
  process.argv.some((arg) => arg.includes('prisma'));

export default defineConfig({
  schema: './schema.prisma',
  migrations: {
    path: './migrations',
  },
  datasource: {
    // Если это CLI (миграции) — используем DATABASE_URL (Direct)
    // В остальных случаях (Runtime) — PRISMA_DB_URL (Pooled)
    url: isCLI ? process.env.DATABASE_URL : process.env.PRISMA_DB_URL,
  },
});
