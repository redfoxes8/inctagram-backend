import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { PostMapper } from '../mappers/post.mapper';
import { IPostQueryRepository } from '../../domain/interfaces/post-query-repository.interface';

@Injectable()
export class PostQueryRepository implements IPostQueryRepository {
  constructor(private prisma: PrismaService) {}

  async getLatestPosts(limit: number) {
    const result = await this.prisma.post.findMany({
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        images: true,
      },
    });
    return PostMapper.toDomainMany(result);
  }
}
