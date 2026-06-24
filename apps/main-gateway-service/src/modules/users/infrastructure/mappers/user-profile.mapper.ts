import { Prisma, type UserProfile } from '../../../../core/prisma/client';
import { UserProfileEntity } from '../../domain/user-profile.entity';
import {
  type UserProfilePublicView,
  type UserProfileSettingsView,
} from '../../domain/interfaces/user-profile.query-repository.interface';

export type UserProfileRecord = UserProfile;

export class UserProfileMapper {
  public static toDomain(model: UserProfileRecord): UserProfileEntity {
    return new UserProfileEntity({
      id: model.id,
      userId: model.userId,
      firstName: model.firstName,
      lastName: model.lastName,
      dateOfBirth: model.dateOfBirth,
      country: model.country,
      city: model.city,
      aboutMe: model.aboutMe,
      avatarFileId: model.avatarFileId,
      avatarUrl: model.avatarUrl,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
    });
  }

  public static toCreateData(profile: UserProfileEntity): Prisma.UserProfileUncheckedCreateInput {
    return {
      id: profile.id,
      userId: profile.userId,
      firstName: profile.firstName,
      lastName: profile.lastName,
      dateOfBirth: profile.dateOfBirth,
      country: profile.country,
      city: profile.city,
      aboutMe: profile.aboutMe,
      avatarFileId: profile.avatarFileId,
      avatarUrl: profile.avatarUrl,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }

  public static toUpdateData(profile: UserProfileEntity): Prisma.UserProfileUncheckedUpdateInput {
    return {
      firstName: profile.firstName,
      lastName: profile.lastName,
      dateOfBirth: profile.dateOfBirth,
      country: profile.country,
      city: profile.city,
      aboutMe: profile.aboutMe,
      avatarFileId: profile.avatarFileId,
      avatarUrl: profile.avatarUrl,
      updatedAt: profile.updatedAt,
    };
  }

  public static toPublicProfileView(model: UserProfileRecord): UserProfilePublicView {
    return {
      userId: model.userId,
      firstName: model.firstName,
      lastName: model.lastName,
      country: model.country,
      city: model.city,
      aboutMe: model.aboutMe,
      avatarUrl: model.avatarUrl,
    };
  }

  public static toProfileSettingsView(model: UserProfileRecord): UserProfileSettingsView {
    return {
      userId: model.userId,
      firstName: model.firstName,
      lastName: model.lastName,
      dateOfBirth: model.dateOfBirth ? model.dateOfBirth.toISOString() : null,
      country: model.country,
      city: model.city,
      aboutMe: model.aboutMe,
      avatarFileId: model.avatarFileId,
      avatarUrl: model.avatarUrl,
    };
  }
}
