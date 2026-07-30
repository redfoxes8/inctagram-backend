import { Module } from '@nestjs/common';
import { IPaymentTransactionRepository } from './domain/interfaces/payment-transaction.repository.interface';
import { PaymentTransactionRepository } from './infrastructure/repositories/payment-transaction.repository';
import { IPlanQueryRepository } from './domain/interfaces/plan.query-repository.interface';
import { PlanQueryRepository } from './infrastructure/repositories/plan.query-repository';
import { ISubscriptionQueryRepository } from './domain/interfaces/subscription.query-repository.interface';
import { SubscriptionQueryRepository } from './infrastructure/repositories/subscription.query-repository';
import { ISubscriptionRepository } from './domain/interfaces/subscription.repository.interface';
import { SubscriptionRepository } from './infrastructure/repositories/subscription.repository';

const repositories = [
  { provide: IPaymentTransactionRepository, useClass: PaymentTransactionRepository },
  { provide: IPlanQueryRepository, useClass: PlanQueryRepository },
  { provide: ISubscriptionQueryRepository, useClass: SubscriptionQueryRepository },
  { provide: ISubscriptionRepository, useClass: SubscriptionRepository },
];

@Module({
  imports: [],
  providers: [...repositories],
  controllers: [],
  exports: [],
})
export class PaymentModule {}
