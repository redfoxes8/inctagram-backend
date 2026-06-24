import { UserProfileEntity } from '../user-profile.entity';

export abstract class IUserProfileRepository {
  abstract upsert(profile: UserProfileEntity, tx?: unknown): Promise<UserProfileEntity>;

  abstract findByUserId(userId: string): Promise<UserProfileEntity | null>;
}
