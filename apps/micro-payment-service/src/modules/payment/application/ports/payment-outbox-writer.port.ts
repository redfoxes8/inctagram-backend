import { PaymentIntegrationEventV1 } from '../../../../../../../libs/contracts/src/events/payment-integration-events-v1.event';

export abstract class IPaymentOutboxWriter {
  abstract write(event: PaymentIntegrationEventV1): Promise<void>;
}
