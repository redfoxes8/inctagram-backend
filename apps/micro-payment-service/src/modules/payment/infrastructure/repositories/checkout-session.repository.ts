import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { CheckoutSessionEntity } from '../../domain/entities/checkout-session.entity';
import {
  FindCheckoutByProviderId,
  ICheckoutSessionRepository,
} from '../../domain/interfaces/checkout-session.repository.interface';
import { IdempotencyKey } from '../../domain/value-objects/idempotency-key.value-object';
import { PaymentPrismaMapper } from '../mappers/payment-prisma.mapper';
import type { PaymentPrismaClient } from './payment-prisma-client.type';

@Injectable()
export class CheckoutSessionRepository implements ICheckoutSessionRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PaymentPrismaClient) {}

  public async insert(checkoutSession: CheckoutSessionEntity): Promise<void> {
    await this.prisma.checkoutSession.create({
      data: PaymentPrismaMapper.checkoutToPrisma(checkoutSession),
    });
  }

  public async save(checkoutSession: CheckoutSessionEntity): Promise<void> {
    await this.prisma.checkoutSession.update({
      where: { id: checkoutSession.id },
      data: PaymentPrismaMapper.checkoutToPrisma(checkoutSession),
    });
  }

  public async findById(id: string): Promise<CheckoutSessionEntity | null> {
    const record = await this.prisma.checkoutSession.findUnique({ where: { id } });
    return record ? PaymentPrismaMapper.checkoutToDomain(record) : null;
  }

  public async findByIdempotencyKey(key: IdempotencyKey): Promise<CheckoutSessionEntity | null> {
    const record = await this.prisma.checkoutSession.findUnique({
      where: { idempotencyKey: key.getValue() },
    });
    return record ? PaymentPrismaMapper.checkoutToDomain(record) : null;
  }

  public async findByProviderCheckoutId(
    lookup: FindCheckoutByProviderId,
  ): Promise<CheckoutSessionEntity | null> {
    const record = await this.prisma.checkoutSession.findUnique({
      where: {
        provider_providerCheckoutId: {
          provider: lookup.provider.getValue(),
          providerCheckoutId: lookup.providerCheckoutId,
        },
      },
    });
    return record ? PaymentPrismaMapper.checkoutToDomain(record) : null;
  }
}
