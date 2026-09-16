import { PaymentNotificationType } from '../../../../../../libs/contracts/src/events/notification-events-v1.event';

const BUSINESS_KEY_VERSION = 'v1';

export class PaymentNotificationBusinessKeyFactory {
  public static subscriptionActivated(input: {
    userId: string;
    subscriptionId: string;
    effectiveAt: Date;
  }): string {
    return this.subscriptionKey('SUBSCRIPTION_ACTIVATED', input);
  }

  public static subscriptionExtended(input: {
    userId: string;
    subscriptionId: string;
    effectiveAt: Date;
  }): string {
    return this.subscriptionKey('SUBSCRIPTION_EXTENDED', input);
  }

  public static paymentFailed(providerInvoiceId: string): string {
    return this.invoiceKey('PAYMENT_FAILED', providerInvoiceId);
  }

  public static paymentRecovered(providerInvoiceId: string): string {
    return this.invoiceKey('PAYMENT_RECOVERED', providerInvoiceId);
  }

  public static subscriptionCancelled(input: {
    subscriptionId: string;
    effectiveAt: Date;
  }): string {
    return [
      BUSINESS_KEY_VERSION,
      PaymentNotificationType.SUBSCRIPTION_CANCELLED,
      input.subscriptionId,
      input.effectiveAt.toISOString(),
    ].join(':');
  }

  private static subscriptionKey(
    type: 'SUBSCRIPTION_ACTIVATED' | 'SUBSCRIPTION_EXTENDED',
    input: { userId: string; subscriptionId: string; effectiveAt: Date },
  ): string {
    return [
      BUSINESS_KEY_VERSION,
      type,
      input.userId,
      input.subscriptionId,
      input.effectiveAt.toISOString(),
    ].join(':');
  }

  private static invoiceKey(
    type: 'PAYMENT_FAILED' | 'PAYMENT_RECOVERED',
    providerInvoiceId: string,
  ): string {
    return [BUSINESS_KEY_VERSION, type, providerInvoiceId].join(':');
  }
}
