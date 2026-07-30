import { IPlanQueryRepository } from '../../domain/interfaces/plan.query-repository.interface';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { PlanEntity } from '../../domain/entities/plan.entity';
import { Plan } from '../../../../core/prisma/client';
import { PrismaMapper } from '../mappers/prisma.mapper';
type PlanPrismaRecord = Plan;

@Injectable()
export class PlanQueryRepository implements IPlanQueryRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async getById(id: string): Promise<PlanEntity | null> {
    const result: PlanPrismaRecord | null = await this.prismaService.plan.findUnique({
      where: { id: id },
    });
    if (!result) {
      return null;
    }
    return PrismaMapper.planToDomain(result);
  }

  async getActivePlans(): Promise<PlanEntity[] | null> {
    const result: PlanPrismaRecord[] | [] = await this.prismaService.plan.findMany({
      where: { isActive: true },
    });
    if (result.length === 0) {
      return null;
    }
    return PrismaMapper.planToDomainMany(result);
  }
}
