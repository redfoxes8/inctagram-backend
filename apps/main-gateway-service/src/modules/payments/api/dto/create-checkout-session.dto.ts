import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsBoolean, IsEnum, IsUUID } from 'class-validator';

export enum PaymentProviderDto {
  STRIPE = 'STRIPE',
  PAYPAL = 'PAYPAL',
}

export class CreateCheckoutSessionDto {
  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiProperty({
    enum: PaymentProviderDto,
    description:
      'STRIPE is currently operational. PAYPAL is reserved and currently returns PROVIDER_NOT_SUPPORTED.',
  })
  @IsEnum(PaymentProviderDto)
  provider: PaymentProviderDto;

  @ApiProperty({
    description: 'Required consent to automatic renewal for the initial subscription.',
    example: true,
  })
  @IsBoolean()
  @Equals(true)
  autoRenewConsent: true;
}
