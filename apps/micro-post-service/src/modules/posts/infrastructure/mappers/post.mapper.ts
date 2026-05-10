import { Post as PrismaPost, PostImage as PrismaPostImage } from '@prisma/client';
import { PostEntity } from '../../domain/post.entity';
import { PostImageEntity } from '../../domain/post-image.entity';

export class PostMapper {
  static toDomain(prismaPost: PrismaPost & { images?: PrismaPostImage[] }): PostEntity {
    const images = prismaPost.images?.map(img => 
      PostImageEntity.create({
        id: img.id,
        postId: img.postId,
        fileId: img.fileId,
        order: img.order,
      })
    );

    return new PostEntity({
      id: prismaPost.id,
      ownerId: prismaPost.ownerId,
      description: prismaPost.description,
      createdAt: prismaPost.createdAt,
      updatedAt: prismaPost.updatedAt,
      deletedAt: prismaPost.deletedAt,
      images,
    });
  }

  static toPersistence(domainPost: PostEntity): any {
    return {
      id: domainPost.id,
      ownerId: domainPost.ownerId,
      description: domainPost.description,
      createdAt: domainPost.createdAt,
      updatedAt: domainPost.updatedAt,
      deletedAt: domainPost.deletedAt,
    };
  }
}
