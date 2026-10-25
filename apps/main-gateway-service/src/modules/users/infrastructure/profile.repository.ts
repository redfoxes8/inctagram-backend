import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../core/prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { IProfileRepository } from '../domain/interfaces/user-profile.repository.interface';
import { ProfileEntity } from '../domain/profile.entity';
import { ProfilePrismaMapper } from './mappers/profile.prisma.mapper';
import { requireGatewayTransaction } from '../../../core/prisma/transactions/require-gateway-transaction';
import { PrismaTransactionManager } from '../../../core/prisma/transactions/prisma.transaction.manager';
import { lockGatewayUser } from '../../../core/prisma/transactions/lock-gateway-user';
import { writePaymentUserProfileSnapshot } from './payment-user-profile-snapshot.writer';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';

@Injectable()
export class ProfileRepository implements IProfileRepository {
  constructor(private readonly prismaService: PrismaService) {}

  public async save(profileDomain: ProfileEntity, tx?: unknown): Promise<void> {
    if (tx === undefined) {
      return new PrismaTransactionManager(this.prismaService).execute((transaction) =>
        this.save(profileDomain, transaction),
      );
    }
    const prisma = requireGatewayTransaction(tx);
    const previous = await this.lockByUserId({ userId: profileDomain.userId, transaction: prisma });
    const record = ProfilePrismaMapper.toPrismaRecord(profileDomain);
    try {
      await prisma.profile.upsert({
        where: { id: profileDomain.id },
        // Generic profile-info writes never overwrite avatar from an older entity.
        update: {
          username: record.username,
          firstName: record.firstName,
          lastName: record.lastName,
          dateOfBirth: record.dateOfBirth,
          country: record.country,
          city: record.city,
          aboutMe: record.aboutMe,
          updatedAt: record.updatedAt,
        },
        create: record,
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DomainException({
          code: DomainExceptionCode.BadRequest,
          message: 'Username already taken',
        });
      }
      throw error;
    }
    if (!previous || previous.username !== profileDomain.username) {
      await writePaymentUserProfileSnapshot({ userId: profileDomain.userId, transaction: prisma });
    }
  }

  public async lockByUserId(input: {
    userId: string;
    transaction: unknown;
  }): Promise<ProfileEntity | null> {
    const transaction = requireGatewayTransaction(input.transaction);
    const user = await lockGatewayUser({ userId: input.userId, transaction });
    if (!user || user.deletedAt !== null) {
      throw new DomainException({ code: DomainExceptionCode.NotFound, message: 'User not found' });
    }
    const profile = await transaction.profile.findUnique({ where: { userId: input.userId } });
    return profile ? ProfilePrismaMapper.toDomain(profile) : null;
  }

  public async updateAvatar(input: {
    userId: string;
    avatarFileId: string | null;
    avatarUrl: string | null;
    updatedAt: Date;
    transaction: unknown;
  }): Promise<void> {
    const transaction = requireGatewayTransaction(input.transaction);
    await this.lockByUserId(input);
    await transaction.profile.update({
      where: { userId: input.userId },
      data: {
        avatarFileId: input.avatarFileId,
        avatarUrl: input.avatarUrl,
        updatedAt: input.updatedAt,
      },
    });
  }

  public async findByUserId(userId: string): Promise<ProfileEntity | null> {
    const userProfile = await this.prismaService.profile.findUnique({
      where: {
        userId,
      },
    });

    if (!userProfile) {
      return null;
    }

    return ProfilePrismaMapper.toDomain(userProfile);
  }

  public async findByUsername(username: string): Promise<ProfileEntity | null> {
    const userProfile = await this.prismaService.profile.findUnique({
      where: {
        username: username,
      },
    });

    if (!userProfile) {
      return null;
    }

    return ProfilePrismaMapper.toDomain(userProfile);
  }
}
