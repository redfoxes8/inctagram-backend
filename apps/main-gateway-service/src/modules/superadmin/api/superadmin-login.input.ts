import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { normalizeAdminEmail } from '../application/admin-token';

export class SuperadminLoginInput {
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? normalizeAdminEmail(value) : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password: string;
}
