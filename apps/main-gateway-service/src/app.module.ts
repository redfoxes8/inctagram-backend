import { DynamicModule, Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GatewayConfig } from './core/gateway.config';
import { CoreModule } from '../../../libs/common/src/core.module';
import { CommonModule } from '../../../libs/common/src';
import { GatewayConfigModule } from './core/gateway-config.module';

@Module({
  imports: [CommonModule, CoreModule, GatewayConfigModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {
  static forRoot(config: GatewayConfig): DynamicModule {
    console.log('TestingModule connected?', config.includeTestingModule);

    return {
      module: AppModule,
      imports: [...(config.includeTestingModule ? [] : [])], // TestingModule
    };
  }
}
