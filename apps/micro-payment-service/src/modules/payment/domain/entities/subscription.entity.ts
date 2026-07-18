import { BaseDomainEntity, BaseDomainEntityProps } from '@inctagram/common';
import { Providers } from '../enums/providers.enum';
import { randomUUID } from 'crypto';

export type CreateNewSubscriptionDTO = {
  userId: string;
  planId: string;
  provider: Providers;
};

export type ActivateSubscriptionDTO = {
  startsAt: Date;
  endsAt: Date;
};

type SubscriptionEntityProps = BaseDomainEntityProps & {
  userId: string;
  planId: string;
  startsAt: Date | null;
  endsAt: Date | null;
  isActive: boolean;
  autoRenewal: boolean;
  provider: Providers;
};

export class SubscriptionEntity extends BaseDomainEntity {
  private readonly userId: string;
  private planId: string;
  private startsAt: Date | null;
  private endsAt: Date | null;
  private isActive: boolean;
  private autoRenewal: boolean;
  private provider: Providers;

  constructor(data: SubscriptionEntityProps) {
    super(data);
    this.userId = data.userId;
    this.planId = data.planId;
    this.startsAt = data.startsAt;
    this.endsAt = data.endsAt;
    this.isActive = data.isActive;
    this.autoRenewal = data.autoRenewal;
    this.provider = data.provider;
  }

  public static createNew(dto: CreateNewSubscriptionDTO): SubscriptionEntity {
    return new this({
      id: randomUUID(),
      userId: dto.userId,
      planId: dto.planId,
      startsAt: null,
      endsAt: null,
      isActive: false,
      autoRenewal: true,
      provider: dto.provider,
    });
  }

  public activateSubscription(dto: ActivateSubscriptionDTO): void {
    this.startsAt = dto.startsAt;
    this.endsAt = dto.endsAt;
    this.isActive = true;
    return;
  }

  public deactivateSubscription(): void {
    this.isActive = false;
    return;
  }

  public disableAutoRenewal(): void {
    this.autoRenewal = false;
    return;
  }

  public enableAutoRenewal(): void {
    this.autoRenewal = true;
    return;
  }

  public setPlan(planId: string): void {
    this.planId = planId;
    return;
  }

  public setRenewal(isAutoRenewal: boolean): void {
    this.autoRenewal = isAutoRenewal;
    return;
  }

  public setProvider(provider: Providers): void {
    this.provider = provider;
    return;
  }

  public getUserId(): string {
    return this.userId;
  }

  public getPlanId(): string {
    return this.planId;
  }

  public getStartsAt(): Date | null {
    return this.startsAt;
  }

  public getEndsAt(): Date | null {
    return this.endsAt;
  }

  public getActiveStatus(): boolean {
    return this.isActive;
  }

  public getRenewalStatus(): boolean {
    return this.autoRenewal;
  }

  public getProvider(): Providers {
    return this.provider;
  }
}
