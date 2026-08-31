import { ApiProperty } from '@nestjs/swagger';

export class ProcessWebhookEventResponseDto {
  @ApiProperty({ example: true })
  accepted: boolean;

  @ApiProperty({ example: false })
  duplicate: boolean;

  @ApiProperty({ enum: ['RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED'], example: 'PROCESSED' })
  status: 'RECEIVED' | 'PROCESSED' | 'IGNORED' | 'FAILED';
}
