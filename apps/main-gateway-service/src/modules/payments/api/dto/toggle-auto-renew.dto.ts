import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class ToggleAutoRenewDto {
  @ApiProperty({
    description: 'Enable or disable auto renewal',
  })
  @IsBoolean()
  enabled: boolean;
}
