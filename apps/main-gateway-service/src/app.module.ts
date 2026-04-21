import { DynamicModule, Module } from '@nestjs/common';
import { GatewayConfig } from './core/gateway.config';
import { CoreModule } from '../../../libs/common/src/core.module';
import { CommonModule } from '../../../libs/common/src';
import { GatewayConfigModule } from './core/gateway-config.module';
import { GatewayController } from './api/gateway.controller';
import { FilesHttpClient } from './infrastructure/files-http.client';
import { PrismaModule } from './infrastructure/prisma/config/prisma.module';
import { TestService } from './test.service';
import { TestController } from '../test.controller';

@Module({
  imports: [CommonModule, CoreModule, GatewayConfigModule, PrismaModule],
  controllers: [GatewayController, TestController],
  providers: [FilesHttpClient, TestService],
})
export class AppModule {
  static forRoot(config: GatewayConfig): DynamicModule {
    console.log('TestingModule connected?', config.includeTestingModule);

    return {
      module: AppModule,
      imports: [...(config.includeTestingModule ? [] : [])], // TestingModule
      controllers: [GatewayController],
      providers: [FilesHttpClient],
    };
  }
}
