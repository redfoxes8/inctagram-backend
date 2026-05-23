import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import {
  IUsersQueryRepository,
  type UserMeViewModel,
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

  public async getUserByEmail(email: string): Promise<UserViewModel | null> {
    const user = await this.prismaService.user.findFirst({
      where: {
        email,
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

  public async getProfileById(id: string): Promise<UserMeViewModel | null> {
    const user = await this.prismaService.user.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: {
        username: true,
        email: true,
      },
    });

    if (!user) {
      return null;
    }

    return {
      username: user.username,
      email: user.email,
    };
  }

  public async countActiveUsers(): Promise<number> {
    return this.prismaService.user.count({
      where: {
        deletedAt: null,
      },
    });
  }
}
