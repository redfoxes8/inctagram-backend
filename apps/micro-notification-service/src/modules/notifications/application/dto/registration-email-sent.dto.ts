import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class RegistrationEmailSentDto {
  @IsEmail({}, { message: 'email must be a valid email address' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'confirmationCode must not be empty' })
  confirmationCode: string;
}
