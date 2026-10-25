export type PaymentPageUserProfile = Readonly<{
  userId: string;
  deletedAt: Date | null;
  profileExists: boolean;
  avatarUrl: string | null;
}>;
export abstract class PaymentPageProfiles {
  abstract findProfiles(userIds: string[]): Promise<PaymentPageUserProfile[]>;
}
