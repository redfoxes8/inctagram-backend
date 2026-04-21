import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { GatewayConfig } from '../../../core/gateway.config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private config: GatewayConfig) {
    const adapter = new PrismaPg({
      connectionString: config.prismaUrl,
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
