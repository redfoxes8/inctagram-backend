export type UserProfilePublicView = {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  country: string | null;
  city: string | null;
  aboutMe: string | null;
  avatarUrl: string | null;
};

export type UserProfileSettingsView = {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
  country: string | null;
  city: string | null;
  aboutMe: string | null;
  avatarFileId: string | null;
  avatarUrl: string | null;
};

export abstract class IUserProfileQueryRepository {
  abstract getPublicProfile(userId: string): Promise<UserProfilePublicView | null>;

  abstract getProfileSettings(userId: string): Promise<UserProfileSettingsView | null>;
}
