import { ApiProperty } from '@nestjs/swagger';

export class GetCheckoutSessionStatusResponseDto {
  @ApiProperty({ enum: ['CREATED', 'COMPLETED', 'EXPIRED', 'FAILED'], example: 'COMPLETED' })
  status: string;
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    example: '59d3a914-1707-42cc-952b-bc46e41d2ea8',
  })
  subscriptionId: string | null;
}
