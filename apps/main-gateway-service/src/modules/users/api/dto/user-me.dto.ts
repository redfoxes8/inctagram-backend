import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AccountType } from '../../../../core/prisma/client';

export class UserMeResponseDto {
  @ApiPropertyOptional({
    description: 'Profile user identifier',
    example: 'd9f482a5-072a-4467-8e1d-85f269df16a7',
    nullable: true,
  })
  userId: string | null;

  @ApiPropertyOptional({
    description: 'Avatar image URL',
    example: 's3.eu-central-1://avatars/images/avatar.jpg',
    nullable: true,
  })
  avatarUrl: string | null;

  @ApiProperty({ description: 'User email', example: 'user@example.com' })
  email: string;

  @ApiProperty({ description: 'Username', example: 'cool_user' })
  username: string;

  @ApiPropertyOptional({
    description: 'Profile bio',
    example: 'Big developer 228',
    nullable: true,
  })
  aboutMe: string | null;

  @ApiProperty({
    description: 'Account type',
    enum: AccountType,
    example: AccountType.PERSONAL,
  })
  accountType: AccountType;
}
