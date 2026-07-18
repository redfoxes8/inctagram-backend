import { BaseDomainEntity, BaseDomainEntityProps } from '@inctagram/common';
import { Providers } from '../enums/providers.enum';
import { PaymentTransactionStatus } from '../enums/payment-transaction-status.enum';

type PaymentTransactionProps = BaseDomainEntityProps & {
  provider: Providers;
  eventId: string;
  eventType: string;
  subscriptionId: string;
  status: PaymentTransactionStatus;
  payload: Record<string, any> | null;
  error: string | null;
};

export class PaymentTransactionEntity extends BaseDomainEntity {
  private readonly provider: Providers;
  private readonly eventId: string;
  private readonly eventType: string;
  private readonly subscriptionId: string;
  private readonly status: PaymentTransactionStatus;
  private readonly payload: Record<string, any> | null;
  private readonly error: string | null;

  constructor(data: PaymentTransactionProps) {
    super(data);
    this.provider = data.provider;
    this.eventId = data.eventId;
    this.eventType = data.eventType;
    this.subscriptionId = data.subscriptionId;
    this.status = data.status;
    this.payload = data.payload;
    this.error = data.error;
  }

  public getProvider(): Providers {
    return this.provider;
  }

  public getEventId(): string {
    return this.eventId;
  }

  public getEventType(): string {
    return this.eventType;
  }

  public getSubscriptionId(): string {
    return this.subscriptionId;
  }

  public getStatus(): PaymentTransactionStatus {
    return this.status;
  }

  public getPayload(): Record<string, any> | null {
    return this.payload;
  }

  public getError(): string | null {
    return this.error;
  }
}
