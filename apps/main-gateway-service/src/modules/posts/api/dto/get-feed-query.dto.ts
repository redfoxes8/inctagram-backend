import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class GetFeedQueryDto {
  @ApiPropertyOptional({
    description: 'Opaque Base64 cursor returned by the previous response',
    example: 'eyJjcmVhdGVkQXQiOiIyMDI2LTA1LTEyVDEwOjAwOjAwLjAwMFoiLCJpZCI6InBvc3QtaWQifQ==',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Number of posts to return',
    example: 8,
    minimum: 1,
    maximum: 100,
    default: 8,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
