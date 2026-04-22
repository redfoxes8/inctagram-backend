import { DynamicModule, Module } from '@nestjs/common';
import { GatewayConfig } from './core/gateway.config';
import { CoreModule } from '../../../libs/common/src/core.module';
import { CommonModule } from '../../../libs/common/src';
import { GatewayConfigModule } from './core/gateway-config.module';
import { GatewayController } from './modules/testing/api/gateway.controller';
import { FilesHttpClient } from './modules/testing/infrastructure/files-http.client';
import { PrismaModule } from './core/prisma/prisma.module';
import { PrismaTestController } from './modules/testing/api/prisma-test.controller';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { SessionsModule } from './modules/sessions/sessions.module';

@Module({
  imports: [
    CommonModule,
    CoreModule,
    GatewayConfigModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    SessionsModule,
  ],
  controllers: [GatewayController, PrismaTestController],
  providers: [FilesHttpClient],
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
