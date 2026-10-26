import type { PaymentUserProfileSnapshot } from '../../../../../../../libs/contracts/src/events/payment-user-profile-snapshot';

export type PostProfileProtocolConflict = Readonly<{
  outcome: 'PROTOCOL_CONFLICT';
  reason: 'VERSION_CONTENT_MISMATCH' | 'TOMBSTONE_RESURRECTION';
}>;

export type ApplyPostProfileResult =
  | Readonly<{ outcome: 'APPLIED' | 'STALE' | 'UNCHANGED' }>
  | PostProfileProtocolConflict;

export type RepairPostProfileResult =
  | Readonly<{ outcome: 'REPAIRED' | 'UNCHANGED' | 'NOT_FOUND' | 'VERSION_MISMATCH' }>
  | PostProfileProtocolConflict;

// Caller owns commit/rollback, including future progress/fencing writes in the same transaction.
// Protocol conflicts are values; transient storage failures reject separately.
export abstract class PostAdminUserProfiles {
  abstract apply(snapshot: PaymentUserProfileSnapshot): Promise<ApplyPostProfileResult>;

  // sourceVersion is also the expected stored version. Events cannot opt into this capability.
  abstract repairEqualVersionFromTrustedExport(
    snapshot: PaymentUserProfileSnapshot,
  ): Promise<RepairPostProfileResult>;
}
