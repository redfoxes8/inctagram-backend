import { IsString, IsOptional, MinLength } from 'class-validator';

export class GoogleLoginDto {
  @IsString()
  code: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  username?: string;

  @IsOptional()
  @IsString()
  redirectUri?: string;
}
