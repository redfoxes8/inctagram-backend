export interface IPaymentFailedEvent {
  eventId: string;
  occurredOn: string;
  userId: string;
}

export const PAYMENT_FAILED_ROUTING_KEY = 'payment.failed';
