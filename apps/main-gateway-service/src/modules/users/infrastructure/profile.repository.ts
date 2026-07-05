import { Injectable } from '@nestjs/common';
import { PrismaClient, Profile } from '../../../core/prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { IProfileRepository } from '../domain/interfaces/user-profile.repository.interface';
import { ProfileEntity } from '../domain/profile.entity';
import { ProfilePrismaMapper } from './mappers/profile.prisma.mapper';

@Injectable()
export class ProfileRepository implements IProfileRepository {
  constructor(private readonly prismaService: PrismaService) {}

  public async save(profileDomain: ProfileEntity, tx?: PrismaClient): Promise<void> {
    const prisma = tx || this.prismaService;

    const profilePrismaRecord: Profile = ProfilePrismaMapper.toPrismaRecord(profileDomain);

    await prisma.profile.upsert({
      where: { id: profileDomain.id },
      update: profilePrismaRecord,
      create: profilePrismaRecord,
    });

    return;
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
