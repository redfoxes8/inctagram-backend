import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class ConfirmAvatarRequestDto {
  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'The file ID returned from the upload-url endpoint.',
  })
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  fileId: string;
}
