import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { GetPostsCountByUserIdQuery } from './get-posts-count-by-user-id.query';

@QueryHandler(GetPostsCountByUserIdQuery)
export class GetPostsCountByUserIdHandler implements IQueryHandler<GetPostsCountByUserIdQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetPostsCountByUserIdQuery): Promise<number> {
    const { ownerId } = query;
    return this.prisma.post.count({
      where: {
        ownerId,
        deletedAt: null,
      },
    });
  }
}
