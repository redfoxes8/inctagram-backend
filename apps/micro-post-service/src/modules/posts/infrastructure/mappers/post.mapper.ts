import { Post as PrismaPost, PostImage as PrismaPostImage } from '../../../../core/prisma/client';
import { PostEntity } from '../../domain/post.entity';
import { PostImageEntity } from '../../domain/post-image.entity';
import { FileDataType, FileDataViewType, PostViewType } from '../../domain/post.types';

export class PostMapper {
  static toDomain(prismaPost: PrismaPost & { images?: PrismaPostImage[] }): PostEntity {
    const images = prismaPost.images?.map((img) =>
      PostImageEntity.create({
        id: img.id,
        postId: img.postId,
        fileId: img.fileId,
        order: img.order,
      }),
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

  static toView(posts: PostEntity[], filesData: FileDataType): PostViewType[] {
    return posts.map((post) => {
      const images: FileDataViewType[] = post.images?.map((img) => {
        return {
          id: img.id,
          fileId: img.fileId,
          url: filesData.files[img.fileId].fileUrl,
          order: img.order,
        };
      });
      return {
        id: post.id,
        ownerId: post.ownerId,
        description: post.description,
        images: images,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
      };
    });
  }

  static toDomainMany(prismaPosts: PrismaPost[] & { images?: PrismaPostImage[] }): PostEntity[] {
    return prismaPosts.map((post) => PostMapper.toDomain(post));
  }
}
