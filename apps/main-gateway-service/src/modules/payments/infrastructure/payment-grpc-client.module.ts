import { Module } from '@nestjs/common';
import { ClientsModule, type ClientProviderOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';

import { GatewayConfig } from '../../../core/gateway.config';
import { GatewayConfigModule } from '../../../core/gateway-config.module';
import { INCTAGRAM_PAYMENT_V1_PACKAGE_NAME } from '../../../../../../libs/contracts/src';
import { PAYMENT_SERVICE_GRPC_CLIENT } from './payment-grpc.constants';
import { PaymentGrpcClient } from './payment-grpc.client';

@Module({
  imports: [
    GatewayConfigModule,
    ClientsModule.registerAsync([
      {
        name: PAYMENT_SERVICE_GRPC_CLIENT,
        imports: [GatewayConfigModule],
        inject: [GatewayConfig],
        useFactory: (config: GatewayConfig): ClientProviderOptions => ({
          name: PAYMENT_SERVICE_GRPC_CLIENT,
          transport: Transport.GRPC,
          options: {
            package: INCTAGRAM_PAYMENT_V1_PACKAGE_NAME,
            protoPath: join(process.cwd(), 'libs/contracts/src/proto/payment.proto'),
            url: config.paymentServiceGrpcUrl,
          },
        }),
      },
    ]),
  ],
  providers: [PaymentGrpcClient],
  exports: [PaymentGrpcClient],
})
export class PaymentGrpcClientModule {}
