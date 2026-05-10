import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PostConfig } from '../post.config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private config: PostConfig) {
    const adapter = new PrismaPg({
      connectionString: config.databaseUrl,
    });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
