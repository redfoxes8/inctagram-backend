import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class PasswordRecoveryEmailSentDto {
  @IsEmail({}, { message: 'email must be a valid email address' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'recoveryCode must not be empty' })
  recoveryCode: string;
}
