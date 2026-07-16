import { UserViewType } from '../../domain/interfaces/users.query-repository.interface';
import { ProfileViewType } from '../../domain/interfaces/user-profile.query-repository.interface';
import { UserMeResponseDto } from '../dto/user-me.dto';

export class UserHttpMapper {
  static toGetMe(user: UserViewType, profile: ProfileViewType): UserMeResponseDto {
    return {
      userId: user.id,
      avatarUrl: profile.avatarUrl,
      email: user.email,
      username: profile.username,
      aboutMe: profile.aboutMe,
      accountType: user.accountType,
    };
  }
}
