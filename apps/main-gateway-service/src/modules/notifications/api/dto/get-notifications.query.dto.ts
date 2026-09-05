import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetNotificationsQueryDto {
  @ApiPropertyOptional({
    description: 'Opaque cursor returned by a preceding notification history response.',
    example: 'eyJ2ZXJzaW9uIjoxLCJjcmVhdGVkQXQiOiIyMDI2LTA5LTA1VDEwOjAwOjAwLjAwMFoiLCJpZCI6Ii4uLiJ9',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 100, default: 20, example: 20 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}
