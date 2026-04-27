import path from 'path';
import dotenv from 'dotenv';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';

if (!process.env.ENV_FILE_PATH) {
  process.env.ENV_FILE_PATH = path.resolve(__dirname, '../.env.test');
}

if (!process.env.PRISMA_CONFIG_PATH) {
  process.env.PRISMA_CONFIG_PATH = path.resolve(__dirname, '../src/core/prisma/prisma.config.ts');
}

dotenv.config({ path: process.env.ENV_FILE_PATH });
