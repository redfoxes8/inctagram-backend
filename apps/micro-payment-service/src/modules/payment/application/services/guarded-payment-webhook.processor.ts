import { Injectable } from '@nestjs/common';

import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import {
  NormalizedProviderEvent,
  PAYMENT_PROVIDER_ERROR_REASON,
} from '../ports/payment-provider.types';
import { PaymentWebhookProcessor } from '../ports/payment-webhook-processor.port';

@Injectable()
export class GuardedPaymentWebhookProcessor implements PaymentWebhookProcessor {
  public process(event: NormalizedProviderEvent): Promise<void> {
    void event;
    return Promise.reject(
      new DomainException({
        code: DomainExceptionCode.ServiceUnavailable,
        message: 'Payment webhook handler is not available yet',
        extensions: [
          {
            field: 'reason',
            message: PAYMENT_PROVIDER_ERROR_REASON.PAYMENT_WEBHOOK_HANDLER_NOT_READY,
          },
        ],
      }),
    );
  }
}
