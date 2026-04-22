export abstract class IEmailAdapter {
  /** Отправляет код подтверждения при регистрации */
  abstract sendRegistrationCode(email: string, code: string): Promise<void>;

  /** Отправляет ссылку/код для восстановления пароля */
  abstract sendPasswordRecoveryCode(email: string, code: string): Promise<void>;
}
