import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { ProductEntity } from '../../domain/entities/product.entity';
import { IProductRepository } from '../../domain/interfaces/product.repository.interface';
import { PaymentPrismaMapper } from '../mappers/payment-prisma.mapper';
import type { PaymentPrismaClient } from './payment-prisma-client.type';

@Injectable()
export class ProductRepository implements IProductRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PaymentPrismaClient) {}

  public async findById(id: string): Promise<ProductEntity | null> {
    const record = await this.prisma.product.findUnique({ where: { id } });
    return record ? PaymentPrismaMapper.productToDomain(record) : null;
  }

  public async findByCode(code: string): Promise<ProductEntity | null> {
    const record = await this.prisma.product.findUnique({ where: { code } });
    return record ? PaymentPrismaMapper.productToDomain(record) : null;
  }

  public async findActive(): Promise<ProductEntity[]> {
    const records = await this.prisma.product.findMany({
      where: { isActive: true },
      orderBy: [{ billingInterval: 'asc' }, { code: 'asc' }],
    });
    return records.map((record) => PaymentPrismaMapper.productToDomain(record));
  }

  public async insert(product: ProductEntity): Promise<void> {
    await this.prisma.product.create({ data: PaymentPrismaMapper.productToPrisma(product) });
  }

  public async save(product: ProductEntity): Promise<void> {
    await this.prisma.product.update({
      where: { id: product.id },
      data: PaymentPrismaMapper.productToPrisma(product),
    });
  }
}
