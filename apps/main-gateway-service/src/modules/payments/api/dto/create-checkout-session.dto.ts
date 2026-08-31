import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsBoolean, IsEnum, IsUUID } from 'class-validator';

export enum PaymentProviderDto {
  STRIPE = 'STRIPE',
  PAYPAL = 'PAYPAL',
}

export class CreateCheckoutSessionDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Active local payment product identifier.',
    example: '2b8d6f9a-8f87-4c8b-a3b6-c5de92ca6f14',
  })
  @IsUUID()
  productId: string;

  @ApiProperty({
    enum: PaymentProviderDto,
    example: PaymentProviderDto.STRIPE,
    description:
      'STRIPE is currently operational. PAYPAL is reserved and currently returns PROVIDER_NOT_SUPPORTED.',
  })
  @IsEnum(PaymentProviderDto)
  provider: PaymentProviderDto;

  @ApiProperty({
    description: 'Required consent to automatic renewal for the initial subscription.',
    enum: [true],
    example: true,
  })
  @IsBoolean()
  @Equals(true)
  autoRenewConsent: true;
}
