import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';

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
  })
  @IsEnum(PaymentProviderDto)
  provider: PaymentProviderDto;
}
