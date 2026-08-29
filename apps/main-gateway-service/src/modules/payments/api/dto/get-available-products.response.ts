import { ApiProperty } from '@nestjs/swagger';

export enum ProductBillingIntervalDto {
  WEEK = 'WEEK',
  MONTH = 'MONTH',
}

export class AvailablePaymentProductResponseDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Product identifier accepted by POST /api/v1/payments/checkout.',
    example: '2b8d6f9a-8f87-4c8b-a3b6-c5de92ca6f14',
  })
  productId: string;

  @ApiProperty({ example: 'Business - 1 Week' })
  name: string;

  @ApiProperty({
    type: Number,
    example: 700,
    description: 'Price in integer minor currency units; format it for display on the client.',
  })
  amountMinor: number;

  @ApiProperty({ example: 'USD', description: 'ISO 4217 currency code.' })
  currency: string;

  @ApiProperty({ enum: ProductBillingIntervalDto, example: ProductBillingIntervalDto.WEEK })
  billingInterval: ProductBillingIntervalDto;

  @ApiProperty({ type: Number, example: 1 })
  billingIntervalCount: number;
}

export class GetAvailableProductsResponseDto {
  @ApiProperty({ type: [AvailablePaymentProductResponseDto] })
  items: AvailablePaymentProductResponseDto[];
}
