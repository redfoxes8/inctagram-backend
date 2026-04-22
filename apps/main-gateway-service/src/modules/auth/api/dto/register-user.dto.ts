import { IsEmail, IsOptional, IsString, Length, Matches } from 'class-validator';

export class RegisterUserDto {
  @IsString()
  @Length(6, 30)
  @Matches(/^[0-9A-Za-z_-]+$/)
  username: string;

  @IsEmail()
  email: string;

  @IsString()
  @Length(6, 20)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,20}$/)
  password: string;

  @IsOptional()
  @IsString()
  passwordConfirmation?: string;
}
