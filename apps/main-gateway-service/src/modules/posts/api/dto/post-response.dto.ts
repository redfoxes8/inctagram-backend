import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PostImageResponseDto {
  @ApiProperty({ example: 'image-id' })
  id: string;

  @ApiProperty({ example: 'file-id' })
  fileId: string;

  @ApiProperty({ example: 'https://cdn.nymbi.org/posts/file-id.jpg' })
  url: string;

  @ApiProperty({ example: 0 })
  order: number;
}

export class PostResponseDto {
  @ApiProperty({ example: 'post-id' })
  id: string;

  @ApiProperty({ example: 'user-id' })
  ownerId: string;

  @ApiProperty({ example: 'My first Inctagram post' })
  description: string;

  @ApiProperty({ type: [PostImageResponseDto] })
  images: PostImageResponseDto[];

  @ApiProperty({ example: '2026-05-12T10:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2026-05-12T10:00:00.000Z' })
  updatedAt: string;
}

export class CreatePostResponseDto {
  @ApiProperty({ type: PostResponseDto })
  post: PostResponseDto;
}

export class GetFeedResponseDto {
  @ApiProperty({ type: [PostResponseDto] })
  posts: PostResponseDto[];

  @ApiPropertyOptional({
    description: 'Opaque Base64 cursor for the next page',
    example: 'eyJjcmVhdGVkQXQiOiIyMDI2LTA1LTEyVDEwOjAwOjAwLjAwMFoiLCJpZCI6InBvc3QtaWQifQ==',
  })
  nextCursor?: string;

  @ApiProperty({ example: true })
  hasMore: boolean;
}
