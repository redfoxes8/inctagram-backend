import { IsString, IsOptional, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GoogleLoginDto {
  @ApiProperty({ description: 'Authorization code received from Google' })
  @IsString()
  code: string;

  @ApiProperty({
    description: 'Optional username if user wants to set it during first login',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  username?: string;

  @ApiProperty({
    description: 'Dynamic redirect URI to support different environments',
    required: false,
  })
  @IsOptional()
  @IsString()
  redirectUri?: string;
}
