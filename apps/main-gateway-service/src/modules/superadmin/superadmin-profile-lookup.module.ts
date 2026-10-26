import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { PaymentPageProfiles } from './domain/payment-page-profiles.port';
import { PaymentPageProfilesQueryRepository } from './infrastructure/payment-page-profiles.query-repository';

@Module({
  imports: [PrismaModule],
  providers: [{ provide: PaymentPageProfiles, useClass: PaymentPageProfilesQueryRepository }],
  exports: [PaymentPageProfiles],
})
export class SuperadminProfileLookupModule {}
