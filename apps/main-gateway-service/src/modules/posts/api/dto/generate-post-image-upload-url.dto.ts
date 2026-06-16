import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, Max, Min } from 'class-validator';

const MAX_UPLOAD_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

export enum PostImageExtension {
  JPEG = '.jpeg',
  JPG = '.jpg',
  PNG = '.png',
  WEBP = '.webp',
}

export class GeneratePostImageUploadUrlDto {
  @ApiProperty({
    enum: PostImageExtension,
    example: PostImageExtension.WEBP,
    description: 'Physical file extension required for S3 bucket routing and Content-Type generation. MUST include the leading dot.',
  })
  @IsEnum(PostImageExtension)
  fileExtension: PostImageExtension;

  @ApiProperty({
    description: 'File size in bytes',
    example: 524288,
    minimum: 1,
    maximum: MAX_UPLOAD_FILE_SIZE_BYTES,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_UPLOAD_FILE_SIZE_BYTES)
  fileSize: number;
}
