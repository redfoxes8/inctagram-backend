import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetPaymentHistoryQueryParams {
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    default: 1,
    example: 1,
    description: 'One-based payment history page number.',
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  pageNumber: number = 1;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 50,
    default: 10,
    example: 10,
    description: 'Number of payment records per page.',
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize: number = 10;
}
