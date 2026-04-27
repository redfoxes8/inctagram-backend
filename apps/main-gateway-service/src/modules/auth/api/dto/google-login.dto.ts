import { IsString, IsOptional, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GoogleLoginDto {
  @ApiProperty({ description: 'Google authorization code', example: '4/0AdQt8qi...' })
  @IsString()
  code: string;

  @ApiProperty({ description: 'Optional username for new users', example: 'google_user', required: false })
  @IsOptional()
  @IsString()
  @MinLength(3)
  username?: string;

  @ApiProperty({ description: 'Redirect URI used in Google console', example: 'http://localhost:3000/auth/google/callback', required: false })
  @IsOptional()
  @IsString()
  redirectUri?: string;
}
