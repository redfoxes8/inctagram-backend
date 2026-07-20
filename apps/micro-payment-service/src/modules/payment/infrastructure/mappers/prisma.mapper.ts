import {
  PaymentTransaction,
  PaymentTransactionProviders,
  PaymentTransactionStatus,
  Plan,
  PlanType,
  Subscription,
  Prisma,
} from '../../../../core/prisma/client';
import { PaymentTransactionEntity } from '../../domain/entities/payment-transaction.entity';
import { PaymentTransactionStatusDomain } from '../../domain/enums/payment-transaction-status.enum';
import JsonNull = Prisma.JsonNull;
import { PaymentTransactionProvidersDomain } from '../../domain/enums/providers.enum';
import { PlanEntity } from '../../domain/entities/plan.entity';
import { PlanTypeDomain } from '../../domain/enums/plan-type.enum';
import { SubscriptionEntity } from '../../domain/entities/subscription.entity';

type PaymentTransactionPrismaRecord = PaymentTransaction;
type PlanPrismaRecord = Plan;
type SubscriptionPrismaRecord = Subscription;
type PaymentTransactionProvidersPrisma = PaymentTransactionProviders;
type PaymentTransactionStatusPrisma = PaymentTransactionStatus;

export type PaymentTransactionPrismaRecordToUpsert = {
  id: string;
  provider: PaymentTransactionProvidersPrisma;
  eventId: string;
  eventType: string;
  subscriptionId: string;
  status: PaymentTransactionStatusPrisma;
  createdAt: Date;
  updatedAt: Date;
  payload: Record<string, any> | typeof JsonNull;
  error: string | null;
};

export class PrismaMapper {
  constructor() {}

  public static paymentTransactionToPrismaRecord(
    domainEntity: PaymentTransactionEntity,
  ): PaymentTransactionPrismaRecordToUpsert {
    const status: PaymentTransactionStatusPrisma = this.paymentTransactionStatusToPrismaRecord(
      domainEntity.getStatus(),
    );
    const provider: PaymentTransactionProvidersPrisma =
      this.paymentTransactionProviderToPrismaRecord(domainEntity.getProvider());
    const payload: Record<string, any> | typeof JsonNull =
      this.paymentTransactionPayloadToPrismaRecord(domainEntity.getPayload());

    return {
      id: domainEntity.id,
      provider: provider,
      eventId: domainEntity.getEventId(),
      eventType: domainEntity.getEventType(),
      subscriptionId: domainEntity.getSubscriptionId(),
      status: status,
      createdAt: domainEntity.createdAt,
      updatedAt: domainEntity.updatedAt,
      payload: payload,
      error: domainEntity.getError(),
    };
  }

  public static paymentTransactionToDomain(
    prismaEntity: PaymentTransactionPrismaRecord,
  ): PaymentTransactionEntity {
    const status: PaymentTransactionStatusDomain = this.paymentTransactionStatusToDomain(
      prismaEntity.status,
    );
    const provider: PaymentTransactionProvidersDomain = this.paymentTransactionProviderToDomain(
      prismaEntity.provider,
    );

    return new PaymentTransactionEntity({
      id: prismaEntity.id,
      provider: provider,
      eventId: prismaEntity.eventId,
      eventType: prismaEntity.eventType,
      subscriptionId: prismaEntity.subscriptionId,
      status: status,
      payload: prismaEntity.payload ? (prismaEntity.payload as Record<string, any>) : null,
      error: prismaEntity.error,
      createdAt: prismaEntity.createdAt,
      updatedAt: prismaEntity.updatedAt,
    });
  }

  public static paymentTransactionToDomainMany(
    prismaEntities: PaymentTransactionPrismaRecord[],
  ): PaymentTransactionEntity[] {
    return prismaEntities.map((entity) => this.paymentTransactionToDomain(entity));
  }

  public static planToDomain(prismaEntity: PlanPrismaRecord): PlanEntity {
    const type: PlanTypeDomain = this.planTypeToDomain(prismaEntity.type);

    return new PlanEntity({
      id: prismaEntity.id,
      type: type,
      duration: prismaEntity.duration,
      price: prismaEntity.price,
      stripeId: prismaEntity.stripeId,
      paypalId: prismaEntity.paypalId,
      isActive: prismaEntity.isActive,
      createdAt: prismaEntity.createdAt,
      updatedAt: prismaEntity.updatedAt,
    });
  }

  public static planToDomainMany(prismaEntities: PlanPrismaRecord[]): PlanEntity[] {
    return prismaEntities.map((entity) => this.planToDomain(entity));
  }

  public static subscriptionToPrismaRecord(
    domainEntity: SubscriptionEntity,
  ): SubscriptionPrismaRecord {
    const provider: PaymentTransactionProvidersPrisma =
      this.paymentTransactionProviderToPrismaRecord(domainEntity.getProvider());

    return {
      id: domainEntity.id,
      userId: domainEntity.getUserId(),
      planId: domainEntity.getPlanId(),
      startsAt: domainEntity.getStartsAt(),
      endsAt: domainEntity.getEndsAt(),
      isActive: domainEntity.getActiveStatus(),
      autoRenewal: domainEntity.getRenewalStatus(),
      provider: provider,
      createdAt: domainEntity.createdAt,
      updatedAt: domainEntity.updatedAt,
      deletedAt: domainEntity.deletedAt,
    };
  }

  public static subscriptionToDomain(prismaEntity: SubscriptionPrismaRecord): SubscriptionEntity {
    const provider: PaymentTransactionProvidersDomain = this.paymentTransactionProviderToDomain(
      prismaEntity.provider,
    );
    return new SubscriptionEntity({
      id: prismaEntity.id,
      userId: prismaEntity.userId,
      planId: prismaEntity.planId,
      startsAt: prismaEntity.startsAt,
      endsAt: prismaEntity.endsAt,
      isActive: prismaEntity.isActive,
      autoRenewal: prismaEntity.autoRenewal,
      provider: provider,
      createdAt: prismaEntity.createdAt,
      updatedAt: prismaEntity.updatedAt,
    });
  }

  public static subscriptionToDomainMany(
    prismaEntities: SubscriptionPrismaRecord[],
  ): SubscriptionEntity[] {
    return prismaEntities.map((entity) => this.subscriptionToDomain(entity));
  }

  private static paymentTransactionStatusToPrismaRecord(
    status: PaymentTransactionStatusDomain,
  ): PaymentTransactionStatusPrisma {
    return PaymentTransactionStatus[status];
  }

  private static paymentTransactionProviderToPrismaRecord(
    provider: PaymentTransactionProvidersDomain,
  ): PaymentTransactionProvidersPrisma {
    return PaymentTransactionProviders[provider];
  }

  private static paymentTransactionPayloadToPrismaRecord(
    payload: Record<string, any> | null,
  ): Record<string, any> | typeof JsonNull {
    return payload ? payload : JsonNull;
  }

  private static paymentTransactionStatusToDomain(
    status: PaymentTransactionStatusPrisma,
  ): PaymentTransactionStatusDomain {
    return PaymentTransactionStatusDomain[status];
  }

  private static paymentTransactionProviderToDomain(
    provider: PaymentTransactionProvidersPrisma,
  ): PaymentTransactionProvidersDomain {
    return PaymentTransactionStatusDomain[provider];
  }

  private static planTypeToDomain(type: PlanType): PlanTypeDomain {
    return PlanTypeDomain[type];
  }
}
