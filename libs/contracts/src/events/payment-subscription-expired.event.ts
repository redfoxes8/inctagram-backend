export interface IPaymentSubscriptionExpiredEvent {
  eventId: string;
  occurredOn: string;

  userId: string;
  subscriptionId: string;
}

//Эту переменную достаточно объявить один раз.
//Все остальные события импортируют только routing key
export const PAYMENT_EVENTS_EXCHANGE = 'common_exchange';

export const PAYMENT_SUBSCRIPTION_EXPIRED_ROUTING_KEY = 'payment.subscription.expired';
