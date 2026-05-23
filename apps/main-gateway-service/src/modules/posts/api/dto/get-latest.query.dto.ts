import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class GetLatestPostsQueryDto {
  @ApiPropertyOptional({
    description: 'Maximum number of posts to return',
    example: 8,
    minimum: 1,
    maximum: 10,
    default: 4,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number;
}
