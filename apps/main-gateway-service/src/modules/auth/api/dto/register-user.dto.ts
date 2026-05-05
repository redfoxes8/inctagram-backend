import { ApiProperty } from '@nestjs/swagger';
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
  @ApiProperty({ description: 'Unique username', example: 'cool_user' })
  @IsString()
  @MinLength(6, { message: 'Minimum number of characters 6' })
  @MaxLength(30, { message: 'Maximum number of characters 30' })
  @Matches(/^[0-9A-Za-z_-]+$/)
  username: string;

  @ApiProperty({ description: 'User email', example: 'user@example.com' })
  @IsEmail({}, { message: 'The email must match the format example@example.com' })
  email: string;

  @ApiProperty({ description: 'User password', example: 'StrongPassword123!' })
  @IsString()
  @Length(6, 20)
  @MinLength(6, { message: 'Minimum number of characters 6' })
  @MaxLength(20, { message: 'Maximum number of characters 20' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,20}$/, {
    message:
      ' Password must contain 0-9, a-z, A-Z, ! " # $ % & \' ( ) * + , - . / : ; < = > ? @ [ \\ ] ^ _ { | } ~ ',
  })
  password: string;

  @ApiProperty({ description: 'Password confirmation', example: 'StrongPassword123!', required: false })
  @IsOptional()
  @IsString()
  passwordConfirmation?: string;
}
