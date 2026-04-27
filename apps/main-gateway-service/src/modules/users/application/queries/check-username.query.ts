import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../../core/prisma/prisma.service';

export class CheckUsernameQuery {
  constructor(public readonly username: string) {}
}

@QueryHandler(CheckUsernameQuery)
export class CheckUsernameHandler implements IQueryHandler<CheckUsernameQuery, { available: boolean }> {
  constructor(private readonly prismaService: PrismaService) {}

  async execute(query: CheckUsernameQuery): Promise<{ available: boolean }> {
    const user = await this.prismaService.user.findFirst({
      where: {
        username: query.username,
        deletedAt: null,
      },
    });

    return { available: !user };
  }
}
