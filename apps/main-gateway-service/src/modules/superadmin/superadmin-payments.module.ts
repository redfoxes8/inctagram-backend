import { PaymentPageProfiles } from './domain/payment-page-profiles.port';
import { PaymentPageProfilesQueryRepository } from './infrastructure/payment-page-profiles.query-repository';
import { EnrichSuperadminPaymentsPageQuery } from './application/enrich-superadmin-payments-page';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { PaymentGrpcClientModule } from '../payments/infrastructure/payment-grpc-client.module';
import { SuperadminPaymentHistory } from './domain/superadmin-payment-history.port';
import { GrpcSuperadminPaymentHistory } from './infrastructure/grpc-superadmin-payment-history';
import { SuperadminPaymentsConfig } from './infrastructure/superadmin-payments.config';
import { GetSuperadminPaymentsQuery } from './application/get-superadmin-payments.query';
import { SuperadminPaymentsResolver } from './api/superadmin-payments.resolver';

@Module({
  imports: [ConfigModule, PrismaModule, PaymentGrpcClientModule],
  providers: [
    { provide: PaymentPageProfiles, useClass: PaymentPageProfilesQueryRepository },
    EnrichSuperadminPaymentsPageQuery,
    SuperadminPaymentsConfig,
    { provide: SuperadminPaymentHistory, useClass: GrpcSuperadminPaymentHistory },
    GetSuperadminPaymentsQuery,
    SuperadminPaymentsResolver,
  ],
})
export class SuperadminPaymentsModule {}
