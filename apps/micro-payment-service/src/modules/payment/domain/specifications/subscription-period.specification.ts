import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { BillingPeriod } from '../value-objects/billing-period.value-object';

export function assertBillingPeriod(period: BillingPeriod): void {
  if (!(period instanceof BillingPeriod)) {
    throw new DomainException({
      code: DomainExceptionCode.BadRequest,
      message: 'Subscription requires a valid billing period',
    });
  }
}

export function isPeriodEnd(period: BillingPeriod, instant: Date): boolean {
  return period.getEndsAt().getTime() === instant.getTime();
}
