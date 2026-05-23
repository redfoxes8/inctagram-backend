import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { PostEntity } from '../../domain/post.entity';
import { PostMapper } from '../mappers/post.mapper';
import { randomUUID } from 'crypto';

const logger = new Logger('PostCommandRepository');

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
            create: post.images.map((img) => ({
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
    // Read fileIds, delete post and create outbox event in a single transaction
    await this.prisma.$transaction(async (tx) => {
      const post = await tx.post.findUnique({ where: { id: postId }, include: { images: true } });
      if (!post) {
        // Let higher layer handle NotFound
        logger.warn(`Post not found during delete: ${postId}`);
        return;
      }

      const fileIds = post.images?.map((i) => i.fileId) ?? [];

      await tx.post.delete({ where: { id: postId } });

      // create outbox event
      const event = {
        eventId: randomUUID(),
        postId,
        ownerId: post.ownerId,
        fileIds,
        occurredOn: new Date().toISOString(),
      };

      await tx.outboxEvent.create({
        data: {
          type: 'POST_DELETED',
          payload: event,
          status: 'PENDING',
        },
      });
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
