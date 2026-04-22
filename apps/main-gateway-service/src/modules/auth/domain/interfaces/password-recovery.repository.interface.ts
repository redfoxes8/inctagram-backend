import { PasswordRecoveryEntity } from '../password-recovery.entity';

export abstract class IPasswordRecoveryRepository {
  abstract save(recovery: PasswordRecoveryEntity): Promise<void>;

  abstract findByUserIdAndCode(userId: string, recoveryCode: string): Promise<PasswordRecoveryEntity | null>;

  abstract deleteByUserId(userId: string): Promise<void>;

  abstract update(recovery: PasswordRecoveryEntity): Promise<void>;
}
