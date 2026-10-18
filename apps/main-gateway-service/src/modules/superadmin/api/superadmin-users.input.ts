import { Transform } from 'class-transformer';
import { IsEnum, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { PaginationInput } from '../../../../../../libs/common/src/graphql/pagination-input';
import { SuperadminUserSort } from '../../../../../../libs/common/types/superadmin-users';

export class SuperadminUsersInput extends PaginationInput {
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf((_object: unknown, value: unknown): boolean => value !== null)
  @IsString()
  @MaxLength(100)
  searchUsername: string | null = null;

  @IsEnum(SuperadminUserSort)
  sort: SuperadminUserSort = SuperadminUserSort.CreatedAtDesc;
}

export class SuperadminUserArgs {
  @IsUUID()
  userId: string;
}
