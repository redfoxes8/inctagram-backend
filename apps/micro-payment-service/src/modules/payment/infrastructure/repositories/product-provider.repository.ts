import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import {
  ActiveProductProviderLookup,
  IProductProviderRepository,
  ProductProviderMapping,
  ProviderBillingIdentifierLookup,
} from '../../domain/interfaces/product-provider.repository.interface';
import { PaymentPrismaMapper } from '../mappers/payment-prisma.mapper';
import type { PaymentPrismaClient } from './payment-prisma-client.type';

@Injectable()
export class ProductProviderRepository implements IProductProviderRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PaymentPrismaClient) {}

  public async findActiveByProduct(
    lookup: ActiveProductProviderLookup,
  ): Promise<ProductProviderMapping | null> {
    const record = await this.prisma.productProvider.findUnique({
      where: {
        productId_provider_environment: {
          productId: lookup.productId,
          provider: lookup.provider.getValue(),
          environment: lookup.environment,
        },
      },
    });
    return record?.isActive ? PaymentPrismaMapper.productProviderToDomain(record) : null;
  }

  public async findByProviderBillingId(
    lookup: ProviderBillingIdentifierLookup,
  ): Promise<ProductProviderMapping | null> {
    const record = await this.prisma.productProvider.findUnique({
      where: {
        provider_providerBillingId_environment: {
          provider: lookup.provider.getValue(),
          providerBillingId: lookup.providerBillingId,
          environment: lookup.environment,
        },
      },
    });
    return record ? PaymentPrismaMapper.productProviderToDomain(record) : null;
  }

  public async insert(mapping: ProductProviderMapping): Promise<void> {
    await this.prisma.productProvider.create({ data: ProductProviderRepository.toData(mapping) });
  }

  public async save(mapping: ProductProviderMapping): Promise<void> {
    await this.prisma.productProvider.update({
      where: { id: mapping.id },
      data: ProductProviderRepository.toData(mapping),
    });
  }

  private static toData(mapping: ProductProviderMapping): {
    id: string;
    productId: string;
    provider: string;
    providerProductId: string | null;
    providerBillingId: string;
    environment: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  } {
    return {
      ...mapping,
      provider: mapping.provider.getValue(),
      createdAt: new Date(mapping.createdAt.getTime()),
      updatedAt: new Date(mapping.updatedAt.getTime()),
    };
  }
}
