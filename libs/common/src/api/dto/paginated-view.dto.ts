import { ApiProperty } from '@nestjs/swagger';

export class PaginatedViewDto<T> {
  @ApiProperty({ description: 'Total number of items', example: 100 })
  totalCount: number;

  @ApiProperty({ description: 'Number of items per page', example: 10 })
  pageSize: number;

  @ApiProperty({ description: 'Current page number', example: 1 })
  page: number;

  @ApiProperty({ description: 'Total number of pages', example: 10 })
  pagesCount: number;

  items: T[];
}
