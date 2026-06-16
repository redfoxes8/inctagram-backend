import { type UserMeViewModel } from '../../domain/interfaces/users.query-repository.interface';
import { UserMeResponseDto } from '../dto/user-me-response.dto';

export class UserMeResponseMapper {
  public static fromProfile(profile: UserMeViewModel): UserMeResponseDto {
    return {
      userId: null,
      email: profile.email,
      username: profile.username,
      avatarUrl: null,
      aboutMe: null,
    };
  }
}
