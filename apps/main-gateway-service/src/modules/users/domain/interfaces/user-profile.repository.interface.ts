import { ProfileEntity } from '../profile.entity';

export abstract class IProfileRepository {
  abstract save(profile: ProfileEntity, tx?: unknown): Promise<void>;
  abstract lockByUserId(input: {
    userId: string;
    transaction: unknown;
  }): Promise<ProfileEntity | null>;
  abstract updateAvatar(input: {
    userId: string;
    avatarFileId: string | null;
    avatarUrl: string | null;
    updatedAt: Date;
    transaction: unknown;
  }): Promise<void>;

  abstract findByUserId(userId: string): Promise<ProfileEntity | null>;

  abstract findByUsername(username: string): Promise<ProfileEntity | null>;
}
