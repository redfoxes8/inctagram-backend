import { PlanEntity } from '../entities/plan.entity';

export abstract class IPlanQueryRepository {
  abstract getById(id: string): PlanEntity;

  abstract getActivePlans(): PlanEntity[];
}
