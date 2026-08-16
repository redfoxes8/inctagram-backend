import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { BillingInterval } from '../enums/billing-interval.enum';
import { assertPositiveBillingIntervalCount } from '../specifications/positive-billing-interval-count.specification';
import { assertValidDate } from '../specifications/valid-date.specification';

export type BillingPeriodProps = {
  startsAt: Date;
  billingInterval: BillingInterval;
  billingIntervalCount: number;
};

export type BillingPeriodBoundaryProps = {
  startsAt: Date;
  endsAt: Date;
};

export class BillingPeriod {
  private readonly startsAt: Date;
  private readonly endsAt: Date;

  constructor(props: BillingPeriodProps | BillingPeriodBoundaryProps) {
    assertValidDate({
      value: props.startsAt,
      message: 'Billing period startsAt must be a valid Date',
    });
    const startsAt = new Date(props.startsAt.getTime());
    const endsAt =
      'endsAt' in props
        ? BillingPeriod.copyRestoredEndsAt(props.endsAt)
        : BillingPeriod.calculateValidatedEndsAt(startsAt, props);

    if (endsAt.getTime() <= startsAt.getTime()) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Billing period endsAt must be after startsAt',
      });
    }

    this.startsAt = startsAt;
    this.endsAt = endsAt;
  }

  public static fromBoundaries(props: BillingPeriodBoundaryProps): BillingPeriod {
    return new BillingPeriod(props);
  }

  public getStartsAt(): Date {
    return new Date(this.startsAt.getTime());
  }

  public getEndsAt(): Date {
    return new Date(this.endsAt.getTime());
  }

  public contains(instant: Date): boolean {
    assertValidDate({ value: instant, message: 'Billing period instant must be a valid Date' });
    const timestamp = instant.getTime();
    return this.startsAt.getTime() <= timestamp && timestamp < this.endsAt.getTime();
  }

  private static calculateEndsAt(
    startsAt: Date,
    billingInterval: BillingInterval,
    billingIntervalCount: number,
  ): Date {
    if (billingInterval === BillingInterval.WEEK) {
      return BillingPeriod.addUtcWeeks(startsAt, billingIntervalCount);
    }

    if (billingInterval === BillingInterval.MONTH) {
      return BillingPeriod.addUtcMonths(startsAt, billingIntervalCount);
    }

    throw new DomainException({
      code: DomainExceptionCode.BadRequest,
      message: 'Billing interval is not supported',
    });
  }

  private static calculateValidatedEndsAt(startsAt: Date, props: BillingPeriodProps): Date {
    assertPositiveBillingIntervalCount(props.billingIntervalCount);
    return BillingPeriod.calculateEndsAt(
      startsAt,
      props.billingInterval,
      props.billingIntervalCount,
    );
  }

  private static copyRestoredEndsAt(endsAt: Date): Date {
    assertValidDate({ value: endsAt, message: 'Billing period endsAt must be a valid Date' });
    return new Date(endsAt.getTime());
  }

  private static addUtcWeeks(startsAt: Date, count: number): Date {
    const days = count * 7;
    if (!Number.isSafeInteger(days)) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Billing interval count causes a date overflow',
      });
    }

    const result = new Date(startsAt.getTime());
    result.setUTCDate(result.getUTCDate() + days);
    assertValidDate({ value: result, message: 'Billing interval count causes a date overflow' });
    return result;
  }

  private static addUtcMonths(startsAt: Date, count: number): Date {
    const originalDay = startsAt.getUTCDate();
    const result = new Date(startsAt.getTime());
    result.setUTCDate(1);
    result.setUTCMonth(result.getUTCMonth() + count);
    assertValidDate({ value: result, message: 'Billing interval count causes a date overflow' });

    const lastDayOfTargetMonth = new Date(result.getTime());
    lastDayOfTargetMonth.setUTCMonth(lastDayOfTargetMonth.getUTCMonth() + 1, 0);
    assertValidDate({
      value: lastDayOfTargetMonth,
      message: 'Billing interval count causes a date overflow',
    });
    result.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth.getUTCDate()));
    assertValidDate({ value: result, message: 'Billing interval count causes a date overflow' });
    return result;
  }
}
