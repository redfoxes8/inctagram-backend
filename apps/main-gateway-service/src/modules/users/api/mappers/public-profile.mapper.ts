import { type UserViewModel } from '../../domain/interfaces/users.query-repository.interface';
import { type UserProfilePublicView } from '../../domain/interfaces/user-profile.query-repository.interface';
import { PublicProfileResponseDto } from '../dto/public-profile-response.dto';

export class PublicProfileMapper {
  public static toPublicProfileResponse(
    user: UserViewModel,
    profile: UserProfilePublicView | null,
    postsCount: number,
  ): PublicProfileResponseDto {
    return {
      id: user.id,
      username: user.username,
      firstName: profile?.firstName ?? null,
      lastName: profile?.lastName ?? null,
      country: profile?.country ?? null,
      city: profile?.city ?? null,
      aboutMe: profile?.aboutMe ?? null,
      avatarUrl: profile?.avatarUrl ?? null,
      followersCount: 0,
      followingCount: 0,
      postsCount,
    };
  }
}
