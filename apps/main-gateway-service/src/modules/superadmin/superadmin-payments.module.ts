import { GetSuperadminPaymentsPageQuery } from './application/get-superadmin-payments-page.query';
import { SuperadminPaymentsPageReader } from './domain/superadmin-payments-page.port';
import { GrpcSuperadminPaymentsPage } from './infrastructure/grpc-superadmin-payments-page';
import { SuperadminPaymentsPageResolver } from './api/superadmin-payments-page.resolver';
import { SuperadminProfileLookupModule } from './superadmin-profile-lookup.module';
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
  imports: [ConfigModule, PrismaModule, PaymentGrpcClientModule, SuperadminProfileLookupModule],
  providers: [
    GetSuperadminPaymentsPageQuery,
    { provide: SuperadminPaymentsPageReader, useClass: GrpcSuperadminPaymentsPage },
    SuperadminPaymentsPageResolver,
    EnrichSuperadminPaymentsPageQuery,
    SuperadminPaymentsConfig,
    { provide: SuperadminPaymentHistory, useClass: GrpcSuperadminPaymentHistory },
    GetSuperadminPaymentsQuery,
    SuperadminPaymentsResolver,
  ],
})
export class SuperadminPaymentsModule {}
