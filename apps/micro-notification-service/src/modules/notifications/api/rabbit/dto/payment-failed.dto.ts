import { IPaymentFailedEvent } from '../../../../../../../../libs/contracts/src';

export class PaymentFailedDto implements IPaymentFailedEvent {
  eventId: string;

  occurredOn: string;

  userId: string;
}
