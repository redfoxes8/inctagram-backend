import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { UserEntity } from '../domain/user.entity';
import { IUsersRepository } from '../domain/interfaces/users.repository.interface';
import { UserMapper, type UserRecord } from './mappers/user.mapper';

type UserCreateData = {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  isConfirmed: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

type UserUpdateData = {
  username: string;
  email: string;
  passwordHash: string;
  isConfirmed: boolean;
  updatedAt: Date;
  deletedAt: Date | null;
};

@Injectable()
export class PrismaUserRepository implements IUsersRepository {
  constructor(private readonly prismaService: PrismaService) {}

  public async save(user: UserEntity): Promise<UserEntity> {
    const createdUser = await this.prismaService.user.create({
      data: this.toCreateData(user),
    });

    return UserMapper.toDomain(createdUser as UserRecord);
  }

  public async findById(id: string): Promise<UserEntity | null> {
    const user = await this.prismaService.user.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    return user ? UserMapper.toDomain(user as UserRecord) : null;
  }

  public async findByEmail(email: string): Promise<UserEntity | null> {
    const user = await this.prismaService.user.findFirst({
      where: {
        email,
        deletedAt: null,
      },
    });

    return user ? UserMapper.toDomain(user as UserRecord) : null;
  }

  public async findByUsernameOrEmail(usernameOrEmail: string): Promise<UserEntity | null> {
    const user = await this.prismaService.user.findFirst({
      where: {
        deletedAt: null,
        OR: [{ username: usernameOrEmail }, { email: usernameOrEmail }],
      },
    });

    return user ? UserMapper.toDomain(user as UserRecord) : null;
  }

  public async update(user: UserEntity): Promise<UserEntity> {
    const userId = this.requireUserId(user);
    const updatedUser = await this.prismaService.user.update({
      where: {
        id: userId,
      },
      data: this.toUpdateData(user),
    });

    return UserMapper.toDomain(updatedUser as UserRecord);
  }

  private toCreateData(user: UserEntity): UserCreateData {
    const userId = this.requireUserId(user);

    return {
      id: userId,
      username: user.username,
      email: user.email,
      passwordHash: user.passwordHash,
      isConfirmed: user.isConfirmed,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      deletedAt: user.deletedAt,
    };
  }

  private toUpdateData(user: UserEntity): UserUpdateData {
    this.requireUserId(user);
    return {
      username: user.username,
      email: user.email,
      passwordHash: user.passwordHash,
      isConfirmed: user.isConfirmed,
      updatedAt: user.updatedAt,
      deletedAt: user.deletedAt,
    };
  }

  private requireUserId(user: UserEntity): string {
    if (user.id) {
      return user.id;
    }

    throw new Error('User id is required for persistence');
  }
}
