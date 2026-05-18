import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, Max, Min } from 'class-validator';

const MAX_UPLOAD_FILE_SIZE_BYTES = 20 * 1024 * 1024;

export enum UploadFileExtension {
  JPEG = '.jpeg',
  JPG = '.jpg',
  PNG = '.png',
  GIF = '.gif',
  WEBP = '.webp',
  PDF = '.pdf',
  MP4 = '.mp4',
  MP3 = '.mp3',
  WEBM = '.webm',
}

export class GenerateUploadUrlDto {
  @ApiProperty({
    enum: UploadFileExtension,
    example: UploadFileExtension.JPEG,
  })
  @IsEnum(UploadFileExtension)
  fileExtension: UploadFileExtension;

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
