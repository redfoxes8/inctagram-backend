import { add } from 'date-fns';
import {
  BaseDomainEntity,
  type BaseDomainEntityProps,
} from '../../../../../../libs/common/src/domain/base.domain.entity';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';

export type PasswordRecoveryEntityProps = BaseDomainEntityProps<string> & {
  userId: string;
  recoveryCode: string;
  isUsed?: boolean;
  expirationDate?: Date;
};

export class PasswordRecoveryEntity extends BaseDomainEntity<string> {
  userId: string;
  recoveryCode: string;
  isUsed: boolean;
  expirationDate: Date;

  constructor(data: PasswordRecoveryEntityProps) {
    super(data);
    this.userId = data.userId;
    this.recoveryCode = data.recoveryCode;
    this.isUsed = data.isUsed ?? false;
    this.expirationDate = data.expirationDate ?? add(new Date(), { hours: 1 });
  }

  public isExpired(): boolean {
    return this.expirationDate < new Date();
  }

  public markAsUsed(): void {
    if (this.isUsed) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Recovery code is already used',
      });
    }

    if (this.isExpired()) {
      throw new DomainException({
        code: DomainExceptionCode.PasswordRecoveryCodeExpired,
        message: 'Recovery code is expired',
      });
    }

    this.isUsed = true;
    this.touch();
  }
}
