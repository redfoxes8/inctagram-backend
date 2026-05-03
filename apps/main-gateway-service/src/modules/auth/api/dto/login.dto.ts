import { IsNotEmpty, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDTO {
  @ApiProperty({ 
    description: 'Username or Email. Minimum length for username is 6, maximum 30. Email format is also supported.', 
    example: 'cool_user',
    minLength: 6,
  })
  @IsString()
  @IsNotEmpty()
  usernameOrEmail: string;

  @ApiProperty({ 
    description: 'User password. Must contain 0-9, a-z, A-Z, and special characters.', 
    example: 'StrongPassword123!',
    minLength: 6,
    maxLength: 20,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(6, { message: 'Minimum number of characters 6' })
  @MaxLength(20, { message: 'Maximum number of characters 20' })
  password: string;
}
