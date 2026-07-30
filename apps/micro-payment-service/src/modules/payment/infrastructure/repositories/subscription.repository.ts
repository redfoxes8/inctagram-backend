import { ISubscriptionRepository } from '../../domain/interfaces/subscription.repository.interface';
import { Injectable } from '@nestjs/common';
import { SubscriptionEntity } from '../../domain/entities/subscription.entity';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { Subscription } from '../../../../core/prisma/client';
import { PrismaMapper } from '../mappers/prisma.mapper';
type SubscriptionPrismaRecord = Subscription;

@Injectable()
export class SubscriptionRepository implements ISubscriptionRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async save(subscriptionDomain: SubscriptionEntity): Promise<void> {
    const prismaRecord: SubscriptionPrismaRecord =
      PrismaMapper.subscriptionToPrismaRecord(subscriptionDomain);
    await this.prismaService.subscription.upsert({
      where: { id: prismaRecord.id },
      update: prismaRecord,
      create: prismaRecord,
    });
    return;
  }

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

  async findActiveByUserId(id: string): Promise<SubscriptionEntity[] | null> {
    const result: SubscriptionPrismaRecord[] | [] = await this.prismaService.subscription.findMany({
      where: { userId: id, isActive: true },
    });
    if (result.length === 0) {
      return null;
    }
    return PrismaMapper.subscriptionToDomainMany(result);
  }

  async findByPlanId(id: string): Promise<SubscriptionEntity[] | null> {
    const result: SubscriptionPrismaRecord[] | [] = await this.prismaService.subscription.findMany({
      where: { planId: id },
    });
    if (result.length === 0) {
      return null;
    }
    return PrismaMapper.subscriptionToDomainMany(result);
  }

  async findExpired(): Promise<SubscriptionEntity[] | null> {
    const result: SubscriptionPrismaRecord[] | [] = await this.prismaService.subscription.findMany({
      where: { endsAt: { lt: new Date() } },
    });
    if (result.length === 0) {
      return null;
    }
    return PrismaMapper.subscriptionToDomainMany(result);
  }

  async deleteById(id: string): Promise<void> {
    await this.prismaService.subscription.delete({
      where: { id: id },
    });
    return;
  }
}
