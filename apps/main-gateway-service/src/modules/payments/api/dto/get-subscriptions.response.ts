import { ApiProperty } from '@nestjs/swagger';

export class SubscriptionProductResponseDto {
  @ApiProperty({ format: 'uuid', example: '2b8d6f9a-8f87-4c8b-a3b6-c5de92ca6f14' })
  id: string;
  @ApiProperty({ example: 'BUSINESS_WEEK_1_USD_V1' })
  code: string;
  @ApiProperty({ example: 'Business — 1 Week' })
  name: string;
  @ApiProperty({ enum: ['WEEK', 'MONTH'], example: 'WEEK' })
  billingInterval: string;
  @ApiProperty({ type: 'integer', example: 1 })
  billingIntervalCount: number;
}

export class SubscriptionResponseDto {
  @ApiProperty({ format: 'uuid', example: '59d3a914-1707-42cc-952b-bc46e41d2ea8' })
  id: string;
  @ApiProperty({ type: 'integer', minimum: 1, example: 1 })
  sequence: number;
  @ApiProperty({ type: SubscriptionProductResponseDto })
  product: SubscriptionProductResponseDto;
  @ApiProperty({ format: 'date-time', example: '2026-08-26T14:00:00.000Z' })
  startsAt: string;
  @ApiProperty({ format: 'date-time', example: '2026-09-02T14:00:00.000Z' })
  endsAt: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true, example: null })
  nextBillingAt: string | null;
  @ApiProperty({ example: true })
  autoRenew: boolean;
  @ApiProperty({ enum: ['STRIPE', 'PAYPAL'], example: 'STRIPE' })
  provider: string;
  @ApiProperty({ enum: ['ACTIVE', 'QUEUED', 'EXPIRED', 'CANCELED'], example: 'ACTIVE' })
  status: string;
}

export class GetSubscriptionsResponseDto {
  @ApiProperty({ type: SubscriptionResponseDto, nullable: true, example: null })
  current: SubscriptionResponseDto | null;
  @ApiProperty({ type: [SubscriptionResponseDto] })
  queued: SubscriptionResponseDto[];
}
