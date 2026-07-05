import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { UserEntity } from '../domain/user.entity';
import { IUsersRepository } from '../domain/interfaces/users.repository.interface';
import { UserPrismaMapper, type UserRecord } from './mappers/user.prisma.mapper';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { PrismaClient } from '../../../core/prisma/client';

type UserCreateData = {
  id: string;
  email: string;
  passwordHash: string | null;
  isConfirmed: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

type UserUpdateData = {
  email: string;
  passwordHash: string | null;
  isConfirmed: boolean;
  updatedAt: Date;
  deletedAt: Date | null;
};

@Injectable()
export class PrismaUsersRepository implements IUsersRepository {
  constructor(private readonly prismaService: PrismaService) {}

  public async save(user: UserEntity, tx?: PrismaClient): Promise<UserEntity> {
    const prisma = tx || this.prismaService;
    const createdUser = await prisma.user.create({
      data: this.toCreateData(user),
    });

    return UserPrismaMapper.toDomain(createdUser as UserRecord);
  }

  public async findById(id: string): Promise<UserEntity | null> {
    const user = await this.prismaService.user.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    return user ? UserPrismaMapper.toDomain(user as UserRecord) : null;
  }

  public async findByEmail(email: string): Promise<UserEntity | null> {
    const user = await this.prismaService.user.findFirst({
      where: {
        email,
        deletedAt: null,
      },
    });

    return user ? UserPrismaMapper.toDomain(user as UserRecord) : null;
  }

  public async update(user: UserEntity, tx?: PrismaClient): Promise<UserEntity> {
    const prisma = tx || this.prismaService;
    const userId = this.requireUserId(user);
    const affectedRows = await prisma.user.updateMany({
      where: {
        id: userId,
        deletedAt: null,
      },
      data: this.toUpdateData(user),
    });

    if (affectedRows.count === 0) {
      throw this.createUserNotFoundException(userId);
    }

    const updatedUser = await prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
      },
    });

    if (!updatedUser) {
      throw this.createUserNotFoundException(userId);
    }

    return UserPrismaMapper.toDomain(updatedUser as UserRecord);
  }

  private toCreateData(user: UserEntity): UserCreateData {
    const userId = this.requireUserId(user);

    return {
      id: userId,
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

    throw this.createUserNotFoundException('');
  }

  private createUserNotFoundException(userId: string): DomainException {
    return new DomainException({
      code: DomainExceptionCode.NotFound,
      message: userId ? `User with id ${userId} was not found` : 'User was not found',
    });
  }
}

export { PrismaUsersRepository as PrismaUserRepository };
