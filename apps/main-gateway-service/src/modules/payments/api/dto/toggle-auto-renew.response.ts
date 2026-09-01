import { ApiProperty } from '@nestjs/swagger';

export class ToggleAutoRenewResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: true })
  autoRenew: boolean;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    example: '2026-09-02T14:00:00.000Z',
  })
  nextBillingAt: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'active' })
  providerStatus: string | null;
}
