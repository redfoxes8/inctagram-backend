import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserMeResponseDto {
  @ApiPropertyOptional({
    description: 'Profile user identifier placeholder until Profile storage is introduced',
    example: null,
    nullable: true,
  })
  userId: string | null;

  @ApiPropertyOptional({
    description: 'Avatar image URL placeholder until Avatar storage is introduced',
    example: null,
    nullable: true,
  })
  avatarUrl: string | null;

  @ApiProperty({ description: 'User email', example: 'user@example.com' })
  email: string;

  @ApiProperty({ description: 'Username', example: 'cool_user' })
  username: string;

  @ApiPropertyOptional({
    description: 'Profile bio placeholder until Profile storage is introduced',
    example: null,
    nullable: true,
  })
  aboutMe: string | null;
}
