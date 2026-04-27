import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDTO {
  @ApiProperty({ description: 'Username or Email', example: 'cool_user' })
  @IsString()
  @IsNotEmpty()
  usernameOrEmail: string;

  @ApiProperty({ description: 'User password', example: 'StrongPassword123!' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
