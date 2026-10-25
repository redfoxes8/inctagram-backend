import type { PaymentUserProfileSnapshot } from '../../../../../../../libs/contracts/src/events/payment-user-profile-snapshot';

export type ProfileSnapshotProtocolConflict = Readonly<{
  outcome: 'PROTOCOL_CONFLICT';
  reason: 'VERSION_CONTENT_MISMATCH' | 'TOMBSTONE_RESURRECTION';
}>;
export type ApplyProfileSnapshotResult =
  | Readonly<{ outcome: 'APPLIED' | 'STALE' | 'UNCHANGED' }>
  | ProfileSnapshotProtocolConflict;
export type RepairProfileSnapshotResult =
  | Readonly<{ outcome: 'REPAIRED' | 'UNCHANGED' | 'VERSION_MISMATCH' | 'NOT_FOUND' }>
  | ProfileSnapshotProtocolConflict;

/**
 * Transaction-scoped storage port. Caller commits snapshot + cursor/fencing in the SAME tx.
 * Protocol conflicts are values; storage failures reject and must not be acknowledged as conflicts.
 * No permission flag grants an incoming event the separate trusted-export repair capability.
 */
export abstract class IAdminUserProfileSnapshotRepository {
  abstract apply(snapshot: PaymentUserProfileSnapshot): Promise<ApplyProfileSnapshotResult>;
  // snapshot.sourceVersion is the expected target version (equal-version CAS only).
  abstract repairEqualVersionFromTrustedExport(
    snapshot: PaymentUserProfileSnapshot,
  ): Promise<RepairProfileSnapshotResult>;
}
