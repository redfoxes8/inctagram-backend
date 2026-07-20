import { IPaymentSucceededEvent } from '../../../../../../../../libs/contracts/src';

export class PaymentSucceededEmailSentDto implements IPaymentSucceededEvent {
  eventId: string;
  occurredOn: string;
  userId: string;
  subscriptionId: string;
  amount: string;
  currency: string;
}
