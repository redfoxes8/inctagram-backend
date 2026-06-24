import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '../../../core/prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { IUserProfileRepository } from '../domain/interfaces/user-profile.repository.interface';
import { UserProfileEntity } from '../domain/user-profile.entity';
import { UserProfileMapper } from './mappers/user-profile.mapper';

const logger = new Logger('PrismaUserProfileRepository');

@Injectable()
export class PrismaUserProfileRepository implements IUserProfileRepository {
  constructor(private readonly prismaService: PrismaService) {}

  public async upsert(profile: UserProfileEntity, tx?: PrismaClient): Promise<UserProfileEntity> {
    logger.debug(`upsert user profile: userId=${profile.userId}`);

    const prisma = tx || this.prismaService;
    const userProfile = await prisma.userProfile.upsert({
      where: {
        userId: profile.userId,
      },
      create: UserProfileMapper.toCreateData(profile),
      update: UserProfileMapper.toUpdateData(profile),
    });

    return UserProfileMapper.toDomain(userProfile);
  }

  public async findByUserId(userId: string): Promise<UserProfileEntity | null> {
    const userProfile = await this.prismaService.userProfile.findUnique({
      where: {
        userId,
      },
    });

    if (!userProfile) {
      return null;
    }

    return UserProfileMapper.toDomain(userProfile);
  }
}
