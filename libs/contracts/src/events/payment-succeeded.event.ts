export interface IPaymentSucceededEvent {
  eventId: string;
  occurredOn: string;

  userId: string;
  subscriptionId: string;

  amount: string;
  currency: string;
}

export const PAYMENT_SUCCEEDED_ROUTING_KEY = 'payment.succeeded';
