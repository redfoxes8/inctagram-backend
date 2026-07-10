import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { CoreModule } from '../../../libs/common/src/core.module';
import { getEnvPaths } from '../../../libs/common/src/utils/get-env-paths';

import { PaymentConfig } from './core/payment.config';
import { PaymentConfigModule } from './core/payment-config.module';
import { PaymentRootModule } from './modules/payment-root.module';
import { PaymentModule } from './modules/payment/payment.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: getEnvPaths(),
    }),

    PaymentConfigModule,

    CoreModule,

    PaymentRootModule,

    PaymentModule,
  ],
})
export class AppModule {
  static forRoot(config: PaymentConfig): DynamicModule {
    return {
      module: AppModule,
      providers: [
        {
          provide: PaymentConfig,
          useValue: config,
        },
      ],
      exports: [PaymentConfig],
    };
  }
}
