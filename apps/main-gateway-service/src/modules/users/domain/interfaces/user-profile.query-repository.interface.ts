export type ProfileViewType = {
  userId: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
  country: string | null;
  city: string | null;
  aboutMe: string | null;
  avatarUrl: string | null;
};

export abstract class IProfileQueryRepository {
  abstract getProfileByUserId(userId: string): Promise<ProfileViewType | null>;
}
