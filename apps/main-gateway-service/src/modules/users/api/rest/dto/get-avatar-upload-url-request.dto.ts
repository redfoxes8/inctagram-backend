import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNotEmpty, IsNumber, IsPositive, IsString, Max } from 'class-validator';

const MAX_AVATAR_FILE_SIZE_BYTES = 10_485_760;

export class GetAvatarUploadUrlRequestDto {
  @ApiProperty({
    description: 'File size in bytes',
    example: 524288,
    minimum: 1,
    maximum: MAX_AVATAR_FILE_SIZE_BYTES,
  })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @Max(MAX_AVATAR_FILE_SIZE_BYTES)
  fileSize: number;

  @ApiProperty({
    description: 'File extension without leading dot',
    example: 'webp',
    enum: ['jpg', 'jpeg', 'png', 'webp'],
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(['jpg', 'jpeg', 'png', 'webp'])
  fileExtension: string;
}
