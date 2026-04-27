import { IsEmail, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PasswordRecoveryDto {
  @ApiProperty({ description: 'User email for recovery', example: 'user@example.com' })
  @IsEmail()
  @IsString()
  email: string;
}
