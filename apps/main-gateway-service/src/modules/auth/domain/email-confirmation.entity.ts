import { add } from 'date-fns';
import {
  BaseDomainEntity,
  type BaseDomainEntityProps,
} from '../../../../../../libs/common/src/domain/base.domain.entity';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';

export type EmailConfirmationEntityProps = BaseDomainEntityProps<string> & {
  userId: string;
  confirmationCode: string;
  isConfirmed?: boolean;
  expirationDate?: Date;
};

export class EmailConfirmationEntity extends BaseDomainEntity<string> {
  userId: string;
  confirmationCode: string;
  isConfirmed: boolean;
  expirationDate: Date;

  constructor(data: EmailConfirmationEntityProps) {
    super(data);
    this.userId = data.userId;
    this.confirmationCode = data.confirmationCode;
    this.isConfirmed = data.isConfirmed ?? false;
    this.expirationDate = data.expirationDate ?? add(new Date(), { hours: 1 });
  }

  public isExpired(): boolean {
    return this.expirationDate < new Date();
  }

  public confirm(): void {
    if (this.isConfirmed) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Email is already confirmed',
      });
    }

    if (this.isExpired()) {
      throw new DomainException({
        code: DomainExceptionCode.ConfirmationCodeExpired,
        message: 'Confirmation code is expired',
      });
    }

    this.isConfirmed = true;
    this.touch();
  }
}
