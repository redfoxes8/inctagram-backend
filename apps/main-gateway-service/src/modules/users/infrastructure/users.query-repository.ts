import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import {
  IUsersQueryRepository,
  type UserViewModel,
} from '../domain/interfaces/users.query-repository.interface';

@Injectable()
export class PrismaUsersQueryRepository implements IUsersQueryRepository {
  constructor(private readonly prismaService: PrismaService) {}

  public async getUserById(id: string): Promise<UserViewModel | null> {
    const user = await this.prismaService.user.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: {
        id: true,
        username: true,
        email: true,
        createdAt: true,
        isConfirmed: true,
      },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
      isConfirmed: user.isConfirmed,
    };
  }
}
