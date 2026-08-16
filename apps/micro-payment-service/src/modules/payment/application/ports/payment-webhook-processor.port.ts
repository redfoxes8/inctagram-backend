import { NormalizedProviderEvent } from './payment-provider.types';

export abstract class PaymentWebhookProcessor {
  abstract process(event: NormalizedProviderEvent): Promise<void>;
}
