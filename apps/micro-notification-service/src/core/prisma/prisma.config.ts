import dotenv from 'dotenv';
import { defineConfig } from 'prisma/config';

dotenv.config({
  path: `apps/micro-notification-service/.env.${process.env.NODE_ENV || 'development'}`,
});

export default defineConfig({
  schema: './schema.prisma',
  migrations: {
    path: './migrations',
  },
  datasource: { url: process.env.PRISMA_DB_URL },
});
