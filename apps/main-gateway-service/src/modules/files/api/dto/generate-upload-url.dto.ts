import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, Max, Min } from 'class-validator';

const MAX_UPLOAD_FILE_SIZE_BYTES = 20 * 1024 * 1024;

export enum UploadFileType {
  JPEG = 'JPEG',
  PNG = 'PNG',
}

export class GenerateUploadUrlDto {
  @ApiProperty({
    enum: UploadFileType,
    example: UploadFileType.JPEG,
  })
  @IsEnum(UploadFileType)
  fileType: UploadFileType;

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
