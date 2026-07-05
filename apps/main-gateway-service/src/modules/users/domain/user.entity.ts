import {
  BaseDomainEntity,
  type BaseDomainEntityProps,
} from '../../../../../../libs/common/src/domain/base.domain.entity';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { randomUUID } from 'crypto';

export type UpdateUserCredentialsInput = {
  email: string;
  passwordHash: string | null;
};

export type UserEntityProps = BaseDomainEntityProps<string> & {
  email: string;
  passwordHash: string | null;
  isConfirmed?: boolean;
};

export class UserEntity extends BaseDomainEntity<string> {
  email: string;
  passwordHash: string | null;
  isConfirmed: boolean;

  constructor(data: UserEntityProps) {
    super(data);
    this.email = data.email;
    this.passwordHash = data.passwordHash;
    this.isConfirmed = data.isConfirmed ?? false;
  }

  public static createNew(email: string, passwordHash: string | null): UserEntity {
    return new this({
      id: randomUUID(),
      email: email,
      passwordHash: passwordHash,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      isConfirmed: false,
    });
  }

  public confirmEmail(): void {
    this.isConfirmed = true;
    this.touch();
  }

  public updateCredentials(data: UpdateUserCredentialsInput): void {
    this.email = data.email;
    this.passwordHash = data.passwordHash;
    this.touch();
  }

  public ensureConfirmed(): void {
    if (this.isConfirmed) {
      return;
    }

    throw new DomainException({
      code: DomainExceptionCode.Unauthorized,
      message: 'Email is not confirmed',
    });
  }
}
