import { ApiProperty } from '@nestjs/swagger';

export class CreateCheckoutSessionResponseDto {
  @ApiProperty({ format: 'uuid', example: '81f33ed7-621e-45f8-8d84-453591f246a8' })
  checkoutSessionId: string;

  @ApiProperty({
    format: 'uri',
    description: 'Provider-hosted checkout URL.',
    example: 'https://checkout.stripe.com/c/pay/example',
  })
  checkoutUrl: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    example: '2026-08-26T15:30:00.000Z',
  })
  expiresAt: string | null;
}
