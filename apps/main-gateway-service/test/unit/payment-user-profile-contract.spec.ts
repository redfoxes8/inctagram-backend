import {
  normalizePaymentUserProfileSnapshot,
  parsePaymentProfileVersion,
  PaymentUserProfileContractError,
} from '../../../../libs/contracts/src/events/payment-user-profile-snapshot';
import {
  parsePaymentUserProfileChangedV1,
  PAYMENT_USER_PROFILE_CHANGED_EVENT_TYPE,
} from '../../../../libs/contracts/src/events/payment-user-profile-changed-v1.event';

const SNAPSHOT = {
  userId: 'legacy TEXT source ID',
  sourceVersion: '9007199254740993',
  username: ' Exact <name> ',
  profileExists: true,
  isDeleted: false,
};
const EVENT = {
  ...SNAPSHOT,
  eventType: PAYMENT_USER_PROFILE_CHANGED_EVENT_TYPE,
  schemaVersion: 1,
  eventId: '10000000-0000-4000-8000-000000000001',
  occurredAt: '2026-10-25T12:00:00.000Z',
};

describe('P1a shared profile snapshot/event validation', () => {
  it('preserves TEXT/username and exact BigInt revisions, including 0 and signed BIGINT max', () => {
    expect(normalizePaymentUserProfileSnapshot(SNAPSHOT)).toEqual(SNAPSHOT);
    expect(parsePaymentUserProfileChangedV1(EVENT)).toEqual(EVENT);
    for (const value of ['0', '9007199254740993', '9223372036854775807']) {
      expect(parsePaymentProfileVersion(value)).toBe(BigInt(value));
    }
    for (const state of [
      { username: null, profileExists: false, isDeleted: false },
      { username: null, profileExists: true, isDeleted: true },
      { username: null, profileExists: false, isDeleted: true },
    ]) {
      expect(normalizePaymentUserProfileSnapshot({ ...SNAPSHOT, ...state })).toEqual({
        ...SNAPSHOT,
        ...state,
      });
    }
  });

  it.each([
    null,
    undefined,
    1,
    1n,
    '',
    '00',
    '01',
    '-1',
    '+1',
    ' 1',
    '1 ',
    '1.0',
    '1e2',
    '9223372036854775808',
    '9'.repeat(100),
  ])('rejects noncanonical/out-of-range version %#', (sourceVersion) => {
    expect(() => normalizePaymentUserProfileSnapshot({ ...SNAPSHOT, sourceVersion })).toThrow(
      PaymentUserProfileContractError,
    );
  });

  it.each([
    { userId: '' },
    { userId: ' \t ' },
    { username: null },
    { username: '' },
    { username: undefined },
    { profileExists: false },
    { isDeleted: true },
    { isDeleted: 'false' },
    { email: 'not-a-snapshot-field' },
  ])('rejects incompatible snapshot fields %#', (change) => {
    expect(() => normalizePaymentUserProfileSnapshot({ ...SNAPSHOT, ...change })).toThrow(
      PaymentUserProfileContractError,
    );
  });

  it.each([
    { schemaVersion: 2 },
    { eventType: 'unknown' },
    { eventId: 'invalid' },
    { occurredAt: '2026-02-30T12:00:00.000Z' },
    { occurredAt: '2026-10-25T12:00:00+02:00' },
    { password: 'not-an-event-field' },
    { sourceVersion: '01' },
  ])('rejects invalid envelope without echoing payload %#', (change) => {
    expect(() => parsePaymentUserProfileChangedV1({ ...EVENT, ...change })).toThrow(
      'Invalid payment user profile contract',
    );
  });
});
