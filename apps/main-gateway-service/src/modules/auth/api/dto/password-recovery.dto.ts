import { IsEmail, IsOptional, IsString, Length, Matches } from 'class-validator';

export class PasswordRecoveryDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(6, 64)
  recoveryCode: string;

  @IsString()
  @Length(6, 20)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,20}$/)
  newPassword: string;

  @IsOptional()
  @IsString()
  newPasswordConfirmation?: string;
}
