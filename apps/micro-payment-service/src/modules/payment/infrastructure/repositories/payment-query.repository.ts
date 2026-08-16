import { Injectable } from '@nestjs/common';
import {
  BillingInterval as PrismaBillingInterval,
  CheckoutPurpose as PrismaCheckoutPurpose,
  CheckoutStatus as PrismaCheckoutStatus,
  PaymentKind as PrismaPaymentKind,
  PaymentTransactionStatus as PrismaPaymentTransactionStatus,
  SubscriptionStatus as PrismaSubscriptionStatus,
} from '../../../../core/prisma/client';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import {
  CheckoutStatusProjection,
  ICheckoutStatusQueryPort,
  IPaymentHistoryQueryPort,
  ISubscriptionQueryPort,
  OwnedCheckoutStatusQuery,
  PageResult,
  PaymentHistoryItem,
  PaymentHistoryQuery,
  SubscriptionProjection,
  SubscriptionsResult,
} from '../../application/ports/payment-query.port';
import { BillingInterval } from '../../domain/enums/billing-interval.enum';
import { CheckoutPurpose } from '../../domain/enums/checkout-purpose.enum';
import { CheckoutStatus } from '../../domain/enums/checkout-status.enum';
import { PaymentKind } from '../../domain/enums/payment-kind.enum';
import { PaymentTransactionStatus } from '../../domain/enums/payment-transaction-status.enum';
import { SubscriptionStatus } from '../../domain/enums/subscription-status.enum';

@Injectable()
export class PaymentQueryRepository
  implements ISubscriptionQueryPort, IPaymentHistoryQueryPort, ICheckoutStatusQueryPort
{
  constructor(private readonly prisma: PrismaService) {}

  public async getSubscriptions(userId: string): Promise<SubscriptionsResult> {
    const records = await this.prisma.subscription.findMany({
      where: {
        userId,
        status: { in: [PrismaSubscriptionStatus.ACTIVE, PrismaSubscriptionStatus.QUEUED] },
      },
      include: { product: true },
      orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
    });
    const projections = records.map((record) =>
      PaymentQueryRepository.toSubscriptionProjection(record),
    );
    return {
      current: projections.find(({ status }) => status === SubscriptionStatus.ACTIVE) ?? null,
      queued: projections.filter(({ status }) => status === SubscriptionStatus.QUEUED),
    };
  }

  public async getPaymentHistory(
    query: PaymentHistoryQuery,
  ): Promise<PageResult<PaymentHistoryItem>> {
    const skip = (query.page.page - 1) * query.page.pageSize;
    const [records, totalCount] = await this.prisma.$transaction([
      this.prisma.paymentTransaction.findMany({
        where: { userId: query.userId },
        include: { product: true, checkoutSession: { select: { purpose: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.page.pageSize,
      }),
      this.prisma.paymentTransaction.count({ where: { userId: query.userId } }),
    ]);
    return {
      items: records.map((record) => ({
        transactionId: record.id,
        createdAt: new Date(record.createdAt.getTime()),
        paidAt: record.paidAt ? new Date(record.paidAt.getTime()) : null,
        amountMinor: record.amountMinor,
        currency: record.currency,
        productCode: record.product.code,
        productName: record.product.name,
        billingInterval: PaymentQueryRepository.billingInterval(record.product.billingInterval),
        billingIntervalCount: record.product.billingIntervalCount,
        provider: record.provider,
        kind: PaymentQueryRepository.paymentKind(record.kind),
        status: PaymentQueryRepository.paymentStatus(record.status),
        checkoutPurpose: record.checkoutSession
          ? PaymentQueryRepository.checkoutPurpose(record.checkoutSession.purpose)
          : null,
      })),
      page: query.page.page,
      pageSize: query.page.pageSize,
      totalCount,
      pagesCount: Math.ceil(totalCount / query.page.pageSize),
    };
  }

  public async findOwnedCheckoutStatus(
    query: OwnedCheckoutStatusQuery,
  ): Promise<CheckoutStatusProjection | null> {
    const record = await this.prisma.checkoutSession.findFirst({
      where: { id: query.checkoutSessionId, userId: query.userId },
      include: {
        paymentTransactions: {
          where: { subscriptionId: { not: null } },
          select: { subscriptionId: true },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
        },
      },
    });
    if (!record) return null;
    return {
      checkoutSessionId: record.id,
      status: PaymentQueryRepository.checkoutStatus(record.status),
      resultingSubscriptionId: record.paymentTransactions[0]?.subscriptionId ?? null,
      completedAt: record.completedAt ? new Date(record.completedAt.getTime()) : null,
    };
  }

  private static toSubscriptionProjection(record: {
    id: string;
    provider: string;
    status: PrismaSubscriptionStatus;
    sequence: number;
    startsAt: Date;
    endsAt: Date;
    nextBillingAt: Date | null;
    autoRenew: boolean;
    product: {
      code: string;
      name: string;
      billingInterval: PrismaBillingInterval;
      billingIntervalCount: number;
    };
  }): SubscriptionProjection {
    return {
      id: record.id,
      productCode: record.product.code,
      productName: record.product.name,
      billingInterval: PaymentQueryRepository.billingInterval(record.product.billingInterval),
      billingIntervalCount: record.product.billingIntervalCount,
      startsAt: new Date(record.startsAt.getTime()),
      endsAt: new Date(record.endsAt.getTime()),
      nextBillingAt: record.nextBillingAt ? new Date(record.nextBillingAt.getTime()) : null,
      autoRenew: record.autoRenew,
      provider: record.provider,
      status: PaymentQueryRepository.subscriptionStatus(record.status),
      sequence: record.sequence,
    };
  }

  private static billingInterval(value: PrismaBillingInterval): BillingInterval {
    return value === PrismaBillingInterval.WEEK ? BillingInterval.WEEK : BillingInterval.MONTH;
  }

  private static paymentKind(value: PrismaPaymentKind): PaymentKind {
    return value === PrismaPaymentKind.PURCHASE ? PaymentKind.PURCHASE : PaymentKind.RENEWAL;
  }

  private static checkoutPurpose(value: PrismaCheckoutPurpose): CheckoutPurpose {
    return value === PrismaCheckoutPurpose.INITIAL_SUBSCRIPTION
      ? CheckoutPurpose.INITIAL_SUBSCRIPTION
      : CheckoutPurpose.ADDITIONAL_SUBSCRIPTION;
  }

  private static checkoutStatus(value: PrismaCheckoutStatus): CheckoutStatus {
    switch (value) {
      case PrismaCheckoutStatus.CREATED:
        return CheckoutStatus.CREATED;
      case PrismaCheckoutStatus.COMPLETED:
        return CheckoutStatus.COMPLETED;
      case PrismaCheckoutStatus.EXPIRED:
        return CheckoutStatus.EXPIRED;
      case PrismaCheckoutStatus.FAILED:
        return CheckoutStatus.FAILED;
    }
  }

  private static paymentStatus(value: PrismaPaymentTransactionStatus): PaymentTransactionStatus {
    switch (value) {
      case PrismaPaymentTransactionStatus.PENDING:
        return PaymentTransactionStatus.PENDING;
      case PrismaPaymentTransactionStatus.PROCESSING:
        return PaymentTransactionStatus.PROCESSING;
      case PrismaPaymentTransactionStatus.SUCCEEDED:
        return PaymentTransactionStatus.SUCCEEDED;
      case PrismaPaymentTransactionStatus.FAILED:
        return PaymentTransactionStatus.FAILED;
      case PrismaPaymentTransactionStatus.REFUNDED:
        return PaymentTransactionStatus.REFUNDED;
      case PrismaPaymentTransactionStatus.PARTIALLY_REFUNDED:
        return PaymentTransactionStatus.PARTIALLY_REFUNDED;
    }
  }

  private static subscriptionStatus(value: PrismaSubscriptionStatus): SubscriptionStatus {
    switch (value) {
      case PrismaSubscriptionStatus.ACTIVE:
        return SubscriptionStatus.ACTIVE;
      case PrismaSubscriptionStatus.QUEUED:
        return SubscriptionStatus.QUEUED;
      case PrismaSubscriptionStatus.EXPIRED:
        return SubscriptionStatus.EXPIRED;
      case PrismaSubscriptionStatus.CANCELED:
        return SubscriptionStatus.CANCELED;
    }
  }
}
