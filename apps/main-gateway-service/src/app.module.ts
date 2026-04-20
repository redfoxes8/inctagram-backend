import { DynamicModule, Module } from '@nestjs/common';
import { GatewayConfig } from './core/gateway.config';
import { CoreModule } from '../../../libs/common/src/core.module';
import { CommonModule } from '../../../libs/common/src';
import { GatewayConfigModule } from './core/gateway-config.module';
import { GatewayController } from './api/gateway.controller';

@Module({
  imports: [CommonModule, CoreModule, GatewayConfigModule],
  controllers: [GatewayController],
})
export class AppModule {
  static forRoot(config: GatewayConfig): DynamicModule {
    console.log('TestingModule connected?', config.includeTestingModule);

    return {
      module: AppModule,
      imports: [...(config.includeTestingModule ? [] : [])], // TestingModule
      controllers: [GatewayController],
    };
  }
}
