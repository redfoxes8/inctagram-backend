import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class GetLatestPostsQueryDto {
  @ApiPropertyOptional({
    description: 'Maximum number of posts to return',
    example: 8,
    minimum: 1,
    maximum: 10,
    default: 4,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number;
}

export class FileDataViewType {
  id: string;
  fileId: string;
  url: string;
  order: number;
}

export class PostViewType {
  @ApiProperty({
    description: 'Post identifier',
    example: '5f7b9c8e-1d1d-4d1d-9d1d-5f7b9c8e1d1d',
  })
  id: string;

  @ApiProperty({
    description: 'Owner identifier',
    example: '5f7b9c8e-1d1d-4d1d-9d1d-5f7b9c8e1d1d',
  })
  ownerId: string;

  @ApiProperty({
    description: 'Post description',
    example: 'This is a post description',
  })
  description: string;

  @ApiProperty({
    description: 'Images of the post',
    type: FileDataViewType,
    isArray: true,
    example: {
      id: '5f7b9c8e-1d1d-4d1d-9d1d-5f7b9c8e1d1d',
      fileId: '5f7b9c8e-1d1d-4d1d-9d1d-5f7b9c8e1d1d',
      url: 'https://example.com/file.jpg',
      order: 1,
    },
  })
  images: FileDataViewType[];

  @ApiProperty({
    description: 'Post creation date',
    example: '2021-01-01T00:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Post update date',
    example: '2021-01-01T00:00:00.000Z',
  })
  updatedAt: Date;
}
