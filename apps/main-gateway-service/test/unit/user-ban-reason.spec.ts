import { normalizeUserBanReason } from '../../../../libs/common/src/validation/normalize-user-ban-reason';
import { UserBanReasonCode } from '../../../../libs/common/types/user-ban-reason';

describe('ban reason normalization (internal S2 boundary)', () => {
  it('preserves legacy absence and normalizes standard reasons without text', () => {
    for (const value of [undefined, null, {}, { code: null, text: ' \t ' }]) {
      expect(normalizeUserBanReason(value)).toBeNull();
    }
    for (const code of [UserBanReasonCode.BadBehavior, UserBanReasonCode.AdvertisingPlacement]) {
      for (const text of [undefined, null, '', ' \t ']) {
        expect(normalizeUserBanReason({ code, text })).toEqual({ code, text: null });
      }
    }
  });

  it('trims Another reason and counts 1..500 Unicode code points like PostgreSQL', () => {
    for (const text of ['x', 'x'.repeat(500), '😀'.repeat(500)]) {
      expect(
        normalizeUserBanReason({
          code: UserBanReasonCode.AnotherReason,
          text: ' \t\u00a0' + text + '\ufeff\n',
        }),
      ).toEqual({ code: UserBanReasonCode.AnotherReason, text });
    }
  });

  it.each([
    'BAD_BEHAVIOR',
    [],
    { code: 'UNKNOWN', text: null },
    { code: '', text: null },
    { code: null, text: 'orphan text' },
    { code: UserBanReasonCode.BadBehavior, text: 'not allowed' },
    { code: UserBanReasonCode.AnotherReason },
    { code: UserBanReasonCode.AnotherReason, text: ' \t\u00a0 ' },
    { code: UserBanReasonCode.AnotherReason, text: 'x'.repeat(501) },
    { code: UserBanReasonCode.AnotherReason, text: 42 },
    { code: UserBanReasonCode.BadBehavior, password: 'not-a-reason-field' },
  ])('rejects an invalid code/text shape with a safe domain error (case %#)', (value) => {
    let error: unknown;
    try {
      normalizeUserBanReason(value);
    } catch (caught: unknown) {
      error = caught;
    }
    expect(error).toMatchObject({ code: 400, message: 'Invalid ban reason' });
  });
});
