import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterUserDto {
  @IsString()
  @MinLength(6, { message: 'Minimum number of characters 6' })
  @MaxLength(30, { message: 'Maximum number of characters 30' })
  @Matches(/^[0-9A-Za-z_-]+$/)
  username: string;

  @IsEmail({}, { message: 'The email must match the format example@example.com' })
  email: string;

  @IsString()
  @Length(6, 20)
  @MinLength(6, { message: 'Minimum number of characters 6' })
  @MaxLength(20, { message: 'Maximum number of characters 20' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,20}$/, {
    message:
      ' Password must contain 0-9, a-z, A-Z, ! " # $ % & \' ( ) * + , - . / : ; < = > ? @ [ \\ ] ^ _ { | } ~ ',
  })
  password: string;

  @IsOptional()
  @IsString()
  passwordConfirmation?: string;
}
