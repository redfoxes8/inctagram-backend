import { PlanEntity } from '../entities/plan.entity';

export abstract class IPlanQueryRepository {
  abstract getById(id: string): Promise<PlanEntity | null>;

  abstract getActivePlans(): Promise<PlanEntity[] | null>;
}
