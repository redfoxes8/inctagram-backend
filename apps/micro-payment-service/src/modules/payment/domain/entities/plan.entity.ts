import {
  BaseDomainEntity,
  BaseDomainEntityProps,
} from '../../../../../../../libs/common/src/domain/base.domain.entity';
import { PlanTypeDomain } from '../enums/plan-type.enum';

type PlanEntityProps = BaseDomainEntityProps & {
  type: PlanTypeDomain;
  duration: number;
  price: number;
  stripeId: string;
  paypalId: string;
  isActive: boolean;
};

export class PlanEntity extends BaseDomainEntity {
  private readonly type: PlanTypeDomain;
  private readonly duration: number;
  private readonly price: number;
  private readonly stripeId: string;
  private readonly paypalId: string;
  private readonly isActive: boolean;

  constructor(data: PlanEntityProps) {
    super(data);
    this.type = data.type;
    this.duration = data.duration;
    this.price = data.price;
    this.stripeId = data.stripeId;
    this.paypalId = data.paypalId;
    this.isActive = data.isActive;
  }

  public getType(): PlanTypeDomain {
    return this.type;
  }

  public getDuration(): number {
    return this.duration;
  }

  public getPrice(): number {
    return this.price;
  }

  public getStripeId(): string {
    return this.stripeId;
  }

  public getPayPalId(): string {
    return this.paypalId;
  }

  public getActiveStatus(): boolean {
    return this.isActive;
  }
}
