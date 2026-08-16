import { assertPositivePersistedInteger } from './persisted-integer.specification';

export function assertPositiveBillingIntervalCount(count: number): void {
  assertPositivePersistedInteger(count, 'Billing interval count');
}
