export class SubscriptionResponseDto {
  id: string;

  productId: string;

  provider: string;

  status: string;

  autoRenew: boolean;

  startDate: string;

  endDate: string;
}

export class GetSubscriptionsResponseDto {
  subscriptions: SubscriptionResponseDto[];
}
