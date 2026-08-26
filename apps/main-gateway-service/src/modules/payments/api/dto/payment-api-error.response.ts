import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PaymentApiErrorExtensionDto {
  @ApiProperty({ example: 'reason' })
  field: string;

  @ApiProperty({ example: 'PROVIDER_REJECTED' })
  message: string;
}

export class PaymentApiErrorResponseDto {
  @ApiProperty({
    type: 'integer',
    description: 'HTTP-compatible domain error code.',
    example: 400,
  })
  code: number;

  @ApiProperty({ example: 'Payment provider rejected the request' })
  message: string;

  @ApiProperty({ type: [PaymentApiErrorExtensionDto] })
  extensions: PaymentApiErrorExtensionDto[];

  @ApiPropertyOptional({ type: [PaymentApiErrorExtensionDto] })
  errorsMessages?: PaymentApiErrorExtensionDto[];
}
