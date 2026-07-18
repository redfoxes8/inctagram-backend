import { AccountType } from '../../../../../core/prisma/client';
import { type ProfileViewType } from '../../../domain/interfaces/user-profile.query-repository.interface';

import { GetProfileResponseDto } from '../dto/get-profile.dto';

export class ProfileHttpMapper {
  public static toGetProfile(
    profile: ProfileViewType,
    accountType: AccountType,
    postsCount: number,
  ): GetProfileResponseDto {
    return {
      id: profile.userId,
      username: profile.username,
      firstName: profile.firstName ?? null,
      lastName: profile.lastName ?? null,
      country: profile.country ?? null,
      city: profile.city ?? null,
      aboutMe: profile.aboutMe ?? null,
      avatarUrl: profile.avatarUrl ?? null,
      followersCount: 0,
      followingCount: 0,
      postsCount,
      accountType,
    };
  }
}
