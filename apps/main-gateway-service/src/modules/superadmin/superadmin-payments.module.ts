import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentGrpcClientModule } from '../payments/infrastructure/payment-grpc-client.module';
import { SuperadminPaymentHistory } from './domain/superadmin-payment-history.port';
import { GrpcSuperadminPaymentHistory } from './infrastructure/grpc-superadmin-payment-history';
import { SuperadminPaymentsConfig } from './infrastructure/superadmin-payments.config';
import { GetSuperadminPaymentsQuery } from './application/get-superadmin-payments.query';
import { SuperadminPaymentsResolver } from './api/superadmin-payments.resolver';

@Module({
  imports: [ConfigModule, PaymentGrpcClientModule],
  providers: [
    SuperadminPaymentsConfig,
    { provide: SuperadminPaymentHistory, useClass: GrpcSuperadminPaymentHistory },
    GetSuperadminPaymentsQuery,
    SuperadminPaymentsResolver,
  ],
})
export class SuperadminPaymentsModule {}
