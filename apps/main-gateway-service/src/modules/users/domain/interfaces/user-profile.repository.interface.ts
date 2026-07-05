import { ProfileEntity } from '../profile.entity';

export abstract class IProfileRepository {
  abstract save(profile: ProfileEntity, tx?: unknown): Promise<void>;

  abstract findByUserId(userId: string): Promise<ProfileEntity | null>;

  abstract findByUsername(username: string): Promise<ProfileEntity | null>;
}
