import { Transform } from 'class-transformer';
import { IsString, MaxLength } from 'class-validator';

export class UpdatePostDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(500)
  description: string;
}
