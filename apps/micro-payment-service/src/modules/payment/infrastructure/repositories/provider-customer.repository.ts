import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import {
  IProviderCustomerRepository,
  ProviderCustomer,
  ProviderCustomerIdentifierLookup,
  UserProviderCustomerLookup,
} from '../../domain/interfaces/provider-customer.repository.interface';
import { PaymentPrismaMapper } from '../mappers/payment-prisma.mapper';
import type { PaymentPrismaClient } from './payment-prisma-client.type';

@Injectable()
export class ProviderCustomerRepository implements IProviderCustomerRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PaymentPrismaClient) {}

  public async findByUserAndProvider(
    lookup: UserProviderCustomerLookup,
  ): Promise<ProviderCustomer | null> {
    const record = await this.prisma.providerCustomer.findUnique({
      where: {
        userId_provider: { userId: lookup.userId, provider: lookup.provider.getValue() },
      },
    });
    return record ? PaymentPrismaMapper.providerCustomerToDomain(record) : null;
  }

  public async findByProviderCustomerId(
    lookup: ProviderCustomerIdentifierLookup,
  ): Promise<ProviderCustomer | null> {
    const record = await this.prisma.providerCustomer.findUnique({
      where: {
        provider_providerCustomerId: {
          provider: lookup.provider.getValue(),
          providerCustomerId: lookup.providerCustomerId,
        },
      },
    });
    return record ? PaymentPrismaMapper.providerCustomerToDomain(record) : null;
  }

  public async insertIfAbsent(customer: ProviderCustomer): Promise<ProviderCustomer> {
    const record = await this.prisma.providerCustomer.upsert({
      where: {
        userId_provider: { userId: customer.userId, provider: customer.provider.getValue() },
      },
      create: ProviderCustomerRepository.toData(customer),
      update: {},
    });
    return PaymentPrismaMapper.providerCustomerToDomain(record);
  }

  private static toData(customer: ProviderCustomer): {
    id: string;
    userId: string;
    provider: string;
    providerCustomerId: string;
    createdAt: Date;
    updatedAt: Date;
  } {
    return {
      ...customer,
      provider: customer.provider.getValue(),
      createdAt: new Date(customer.createdAt.getTime()),
      updatedAt: new Date(customer.updatedAt.getTime()),
    };
  }
}
