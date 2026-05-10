import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { PostEntity } from '../../domain/post.entity';
import { PostMapper } from '../mappers/post.mapper';

@Injectable()
export class PostCommandRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createPost(post: PostEntity): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.post.create({
        data: {
          id: post.id,
          ownerId: post.ownerId,
          description: post.description,
          createdAt: post.createdAt,
          updatedAt: post.updatedAt,
          images: {
            create: post.images.map(img => ({
              fileId: img.fileId,
              order: img.order,
            })),
          },
        },
      });
    });
  }

  async updatePost(post: PostEntity): Promise<void> {
    await this.prisma.post.update({
      where: { id: post.id },
      data: {
        description: post.description,
        updatedAt: post.updatedAt,
      },
    });
  }

  async deletePost(postId: string): Promise<void> {
    // Используем мягкое удаление, если это предусмотрено доменной логикой, 
    // но в ТЗ сказано "DeletePostCommand" и "чистый CRUD". 
    // Обычно в таких системах удаление физическое или soft-delete. 
    // Реализуем физическое удаление для чистого CRUD, так как images удалятся по Cascade.
    await this.prisma.post.delete({
      where: { id: postId },
    });
  }

  async findById(postId: string): Promise<PostEntity | null> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: { images: true },
    });

    if (!post) return null;

    return PostMapper.toDomain(post);
  }
}
