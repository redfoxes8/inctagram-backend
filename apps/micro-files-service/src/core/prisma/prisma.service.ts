import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { FilesConfig } from '../files.config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private config: FilesConfig) {
    const schema = PrismaService.resolveSchema(config.prismaDbUrl);
    const adapter = new PrismaPg(
      {
        connectionString: config.prismaDbUrl,
      },
      schema ? { schema } : undefined,
    );
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  private static resolveSchema(connectionString: string): string | undefined {
    if (process.env.TEST_DB_SCHEMA) {
      return process.env.TEST_DB_SCHEMA;
    }

    try {
      return new URL(connectionString).searchParams.get('schema') ?? undefined;
    } catch {
      return undefined;
    }
  }
}
