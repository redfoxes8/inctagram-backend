export abstract class IEmailAdapter {
  /** Sends the confirmation code for registration flow. */
  abstract sendRegistrationCode(email: string, code: string): Promise<void>;

  /** Sends the recovery code for password reset flow. */
  abstract sendPasswordRecoveryCode(email: string, code: string): Promise<void>;
}
