import { type Profile } from '../../../../core/prisma/client';
import { ProfileEntity } from '../../domain/profile.entity';
import { ProfileViewType } from '../../domain/interfaces/user-profile.query-repository.interface';
import { format } from 'date-fns';

export type UserProfileRecord = Profile;

export class ProfilePrismaMapper {
  public static toDomain(model: UserProfileRecord): ProfileEntity {
    return new ProfileEntity({
      id: model.id,
      userId: model.userId,
      username: model.username,
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

  public static toPrismaRecord(profile: ProfileEntity): Profile {
    return {
      id: profile.id,
      userId: profile.userId,
      username: profile.username,
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

  public static toViewType(model: UserProfileRecord): ProfileViewType {
    return {
      userId: model.userId,
      username: model.username,
      firstName: model.firstName,
      lastName: model.lastName,
      dateOfBirth: model.dateOfBirth ? format(model.dateOfBirth, 'dd.MM.yyyy') : null,
      country: model.country,
      city: model.city,
      aboutMe: model.aboutMe,
      avatarUrl: model.avatarUrl,
    };
  }
}
