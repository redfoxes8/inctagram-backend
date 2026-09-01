import { IPaymentSubscriptionExpiredEvent } from '../../../../../../../../libs/contracts/src';

export class PaymentSubscriptionExpiredDto implements IPaymentSubscriptionExpiredEvent {
  eventId: string;
  occurredOn: string;
  userId: string;
  subscriptionId: string;
}
