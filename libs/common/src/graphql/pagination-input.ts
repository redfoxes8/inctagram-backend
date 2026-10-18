import { IsInt, Max, Min } from 'class-validator';

export class PaginationInput {
  @IsInt()
  @Min(1)
  @Max(10_000)
  page: number = 1;

  @IsInt()
  @Min(1)
  @Max(50)
  pageSize: number = 8;
}
