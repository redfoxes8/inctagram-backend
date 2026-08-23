import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { SubscriptionStatus } from '../enums/subscription-status.enum';
import { assertPositivePersistedInteger } from './persisted-integer.specification';

export function assertSubscriptionSequence(sequence: number): void {
  assertPositivePersistedInteger(sequence, 'Subscription sequence');
}

export function assertSubscriptionStatus(status: SubscriptionStatus): void {
  if (!Object.values(SubscriptionStatus).includes(status)) {
    throw new DomainException({
      code: DomainExceptionCode.BadRequest,
      message: 'Subscription status is not supported',
    });
  }
}

export function canOwnAutoRenew(status: SubscriptionStatus): boolean {
  return status === SubscriptionStatus.ACTIVE || status === SubscriptionStatus.QUEUED;
}
