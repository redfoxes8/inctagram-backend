export enum UserBanReasonCode {
  BadBehavior = 'BAD_BEHAVIOR',
  AdvertisingPlacement = 'ADVERTISING_PLACEMENT',
  AnotherReason = 'ANOTHER_REASON',
}

export type UserBanReason =
  | Readonly<{
      code: UserBanReasonCode.BadBehavior | UserBanReasonCode.AdvertisingPlacement;
      text: null;
    }>
  | Readonly<{ code: UserBanReasonCode.AnotherReason; text: string }>;
