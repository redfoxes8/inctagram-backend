import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import {
  IProfileQueryRepository,
  type ProfileViewType,
} from '../domain/interfaces/user-profile.query-repository.interface';
import { ProfilePrismaMapper } from './mappers/profile.prisma.mapper';
import { Profile } from '../../../core/prisma/client';

const logger = new Logger('PrismaUserProfileQueryRepository');

@Injectable()
export class ProfileQueryRepository implements IProfileQueryRepository {
  constructor(private readonly prismaService: PrismaService) {}

  public async getProfileByUserId(userId: string): Promise<ProfileViewType | null> {
    logger.debug(`getPublicProfile userId=${userId}`);

    const userProfile: Profile | null = await this.prismaService.profile.findUnique({
      where: {
        userId,
      },
    });

    if (!userProfile) {
      return null;
    }

    return ProfilePrismaMapper.toViewType(userProfile);
  }
}
