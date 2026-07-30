import { ISubscriptionQueryRepository } from '../../domain/interfaces/subscription.query-repository.interface';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { SubscriptionEntity } from '../../domain/entities/subscription.entity';
import { Subscription } from '../../../../core/prisma/client';
import { PrismaMapper } from '../mappers/prisma.mapper';
type SubscriptionPrismaRecord = Subscription;

@Injectable()
export class SubscriptionQueryRepository implements ISubscriptionQueryRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async findById(id: string): Promise<SubscriptionEntity | null> {
    const result: SubscriptionPrismaRecord | null =
      await this.prismaService.subscription.findUnique({
        where: { id: id },
      });
    if (!result) {
      return null;
    }
    return PrismaMapper.subscriptionToDomain(result);
  }

  async findAllByUserId(id: string): Promise<SubscriptionEntity[] | null> {
    const result: SubscriptionPrismaRecord[] | [] = await this.prismaService.subscription.findMany({
      where: { userId: id },
    });
    if (result.length === 0) {
      return null;
    }
    return PrismaMapper.subscriptionToDomainMany(result);
  }
}
