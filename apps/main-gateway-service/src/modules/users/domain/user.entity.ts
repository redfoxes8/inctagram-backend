import {
  BaseDomainEntity,
  type BaseDomainEntityProps,
} from '../../../../../../libs/common/src/domain/base.domain.entity';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';

export type UpdateUserCredentialsInput = {
  username: string;
  email: string;
  passwordHash: string | null;
};

export type UserEntityProps = BaseDomainEntityProps<string> & {
  username: string;
  email: string;
  passwordHash: string | null;
  isConfirmed?: boolean;
};

export class UserEntity extends BaseDomainEntity<string> {
  username: string;
  email: string;
  passwordHash: string | null;
  isConfirmed: boolean;

  constructor(data: UserEntityProps) {
    super(data);
    this.username = data.username;
    this.email = data.email;
    this.passwordHash = data.passwordHash;
    this.isConfirmed = data.isConfirmed ?? false;
  }

  public confirmEmail(): void {
    this.isConfirmed = true;
    this.touch();
  }

  public updateCredentials(data: UpdateUserCredentialsInput): void {
    this.username = data.username;
    this.email = data.email;
    this.passwordHash = data.passwordHash;
    this.touch();
  }

  public ensureConfirmed(): void {
    if (this.isConfirmed) {
      return;
    }

    throw new DomainException({
      code: DomainExceptionCode.EmailNotConfirmed,
      message: 'Email is not confirmed',
    });
  }
}
