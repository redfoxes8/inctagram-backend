export class SubscriptionProductResponseDto {
  id: string;
  code: string;
  name: string;
  billingInterval: string;
  billingIntervalCount: number;
}

export class SubscriptionResponseDto {
  id: string;
  sequence: number;
  product: SubscriptionProductResponseDto;
  startsAt: string;
  endsAt: string;
  nextBillingAt: string | null;
  autoRenew: boolean;
  provider: string;
  status: string;
}

export class GetSubscriptionsResponseDto {
  current: SubscriptionResponseDto | null;
  queued: SubscriptionResponseDto[];
}
