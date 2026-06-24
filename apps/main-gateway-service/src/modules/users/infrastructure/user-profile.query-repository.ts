import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import {
  IUserProfileQueryRepository,
  type UserProfilePublicView,
  type UserProfileSettingsView,
} from '../domain/interfaces/user-profile.query-repository.interface';
import { UserProfileMapper } from './mappers/user-profile.mapper';

const logger = new Logger('PrismaUserProfileQueryRepository');

@Injectable()
export class PrismaUserProfileQueryRepository implements IUserProfileQueryRepository {
  constructor(private readonly prismaService: PrismaService) {}

  public async getPublicProfile(userId: string): Promise<UserProfilePublicView | null> {
    logger.debug(`getPublicProfile userId=${userId}`);

    const userProfile = await this.prismaService.userProfile.findUnique({
      where: {
        userId,
      },
    });

    if (!userProfile) {
      return null;
    }

    return UserProfileMapper.toPublicProfileView(userProfile);
  }

  public async getProfileSettings(userId: string): Promise<UserProfileSettingsView | null> {
    logger.debug(`getProfileSettings userId=${userId}`);

    const userProfile = await this.prismaService.userProfile.findUnique({
      where: {
        userId,
      },
    });

    if (!userProfile) {
      return null;
    }

    return UserProfileMapper.toProfileSettingsView(userProfile);
  }
}
