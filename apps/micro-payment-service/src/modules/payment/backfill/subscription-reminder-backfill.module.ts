import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { getEnvPaths } from '../../../../../../libs/common/src/utils/get-env-paths';
import { PaymentConfigModule } from '../../../core/payment-config.module';
import { PrismaModule } from '../../../core/prisma/prisma.module';
import { BackfillSubscriptionRemindersService } from '../application/services/backfill-subscription-reminders.service';
import { StageSubscriptionRemindersService } from '../application/services/stage-subscription-reminders.service';
import { IPaymentUnitOfWork } from '../application/ports/payment-unit-of-work.port';
import { PaymentUnitOfWork } from '../infrastructure/repositories/payment-unit-of-work';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: getEnvPaths() }),
    PaymentConfigModule,
    PrismaModule,
  ],
  providers: [
    { provide: IPaymentUnitOfWork, useClass: PaymentUnitOfWork },
    StageSubscriptionRemindersService,
    BackfillSubscriptionRemindersService,
  ],
})
export class SubscriptionReminderBackfillModule {}
