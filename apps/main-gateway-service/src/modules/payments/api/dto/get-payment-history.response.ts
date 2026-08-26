import { ApiProperty } from '@nestjs/swagger';

export class PaymentHistoryItemResponseDto {
  @ApiProperty({ format: 'uuid', example: '6e660aba-669b-4d55-b43b-6ccbfba6e1dd' })
  transactionId: string;
  @ApiProperty({ format: 'date-time', example: '2026-08-26T14:00:00.000Z' })
  createdAt: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true, example: null })
  paidAt: string | null;
  @ApiProperty({ description: 'Amount in integer minor currency units.', example: 800 })
  amountMinor: number;
  @ApiProperty({ example: 'USD' })
  currency: string;
  @ApiProperty({ format: 'uuid', example: '2b8d6f9a-8f87-4c8b-a3b6-c5de92ca6f14' })
  productId: string;
  @ApiProperty({ example: 'Business — 1 Week' })
  productName: string;
  @ApiProperty({ enum: ['WEEK', 'MONTH'], example: 'WEEK' })
  billingInterval: string;
  @ApiProperty({ example: 1 })
  billingIntervalCount: number;
  @ApiProperty({ enum: ['STRIPE', 'PAYPAL'], example: 'STRIPE' })
  provider: string;
  @ApiProperty({ enum: ['PURCHASE', 'RENEWAL'], example: 'PURCHASE' })
  kind: string;
  @ApiProperty({
    enum: ['PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'],
    example: 'SUCCEEDED',
  })
  status: string;
  @ApiProperty({
    enum: ['INITIAL_SUBSCRIPTION', 'ADDITIONAL_SUBSCRIPTION'],
    nullable: true,
    example: 'INITIAL_SUBSCRIPTION',
  })
  checkoutPurpose: string | null;
}

export class GetPaymentHistoryResponseDto {
  @ApiProperty({ type: [PaymentHistoryItemResponseDto] })
  items: PaymentHistoryItemResponseDto[];
  @ApiProperty({ example: 1 })
  totalCount: number;
  @ApiProperty({ example: 1 })
  page: number;
  @ApiProperty({ example: 10 })
  pageSize: number;
  @ApiProperty({ example: 1 })
  pagesCount: number;
}
