import {
  BaseDomainEntity,
  type BaseDomainEntityProps,
} from '../../../../../../libs/common/src/domain/base.domain.entity';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { randomUUID } from 'crypto';
import { AccountType } from '../../../core/prisma/client';

export type UpdateUserCredentialsInput = {
  email: string;
  passwordHash: string | null;
};

export type UserEntityProps = BaseDomainEntityProps<string> & {
  email: string;
  passwordHash: string | null;
  isConfirmed?: boolean;
  accountType?: AccountType;
};

export class UserEntity extends BaseDomainEntity<string> {
  email: string;
  passwordHash: string | null;
  isConfirmed: boolean;
  accountType: AccountType;

  constructor(data: UserEntityProps) {
    super(data);
    this.email = data.email;
    this.passwordHash = data.passwordHash;
    this.isConfirmed = data.isConfirmed ?? false;
    this.accountType = data.accountType ?? AccountType.PERSONAL;
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
      accountType: AccountType.PERSONAL,
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

  public changeAccountType(accountType: AccountType): void {
    this.accountType = accountType;
    this.touch();
  }
}
