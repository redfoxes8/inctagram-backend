import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GetProfileResponseDto {
  @ApiProperty({ description: 'User identifier', example: 'user-id' })
  id: string;

  @ApiProperty({ description: 'Username', example: 'cool_user' })
  username: string;

  @ApiPropertyOptional({
    description: 'First name',
    example: 'John',
    nullable: true,
  })
  firstName: string | null;

  @ApiPropertyOptional({
    description: 'Last name',
    example: 'Doe',
    nullable: true,
  })
  lastName: string | null;

  @ApiPropertyOptional({
    description: 'Country',
    example: 'USA',
    nullable: true,
  })
  country: string | null;

  @ApiPropertyOptional({
    description: 'City',
    example: 'New York',
    nullable: true,
  })
  city: string | null;

  @ApiPropertyOptional({
    description: 'About me bio',
    example: 'Web Developer',
    nullable: true,
  })
  aboutMe: string | null;

  @ApiPropertyOptional({
    description: 'Avatar URL',
    example: 'https://cdn.nymbi.org/avatars/file-id.jpg',
    nullable: true,
  })
  avatarUrl: string | null;

  @ApiProperty({
    description: 'Number of followers (Follow MS is not implemented yet)',
    example: 0,
  })
  followersCount: number;

  @ApiProperty({
    description: 'Number of accounts followed (Follow MS is not implemented yet)',
    example: 0,
  })
  followingCount: number;

  @ApiProperty({
    description: 'Number of posts',
    example: 42,
  })
  postsCount: number;
}
