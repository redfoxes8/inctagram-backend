import { PasswordRecoveryEntity } from '../password-recovery.entity';

export abstract class IPasswordRecoveryRepository {
  abstract save(recovery: PasswordRecoveryEntity): Promise<void>;

  abstract findByCode(recoveryCode: string): Promise<PasswordRecoveryEntity | null>;

  abstract deleteByUserId(userId: string): Promise<void>;

  abstract update(recovery: PasswordRecoveryEntity): Promise<void>;
}
