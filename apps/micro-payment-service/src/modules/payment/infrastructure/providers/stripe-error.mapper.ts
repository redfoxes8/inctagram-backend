import Stripe from 'stripe';

import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { PAYMENT_PROVIDER_ERROR_REASON } from '../../application/ports/payment-provider.types';

export class StripeErrorMapper {
  public static toDomainException(error: unknown): DomainException {
    if (!(error instanceof Stripe.errors.StripeError)) {
      return this.error(
        DomainExceptionCode.InternalServerError,
        'Payment provider operation failed',
        'PROVIDER_FAILURE',
      );
    }

    if (error.type === 'StripeAuthenticationError') {
      return this.error(
        DomainExceptionCode.InternalServerError,
        'Payment provider configuration is invalid',
        'PROVIDER_CONFIGURATION_ERROR',
      );
    }
    if (error.type === 'StripeIdempotencyError') {
      return this.error(
        DomainExceptionCode.Conflict,
        'Payment provider rejected conflicting idempotency facts',
        'PROVIDER_IDEMPOTENCY_CONFLICT',
      );
    }
    if (error.type === 'StripeInvalidRequestError' || error.type === 'StripeCardError') {
      return this.error(
        DomainExceptionCode.BadRequest,
        'Payment provider rejected the request',
        PAYMENT_PROVIDER_ERROR_REASON.PROVIDER_REJECTED,
      );
    }
    if (error.type === 'StripeConnectionError' && error.code === 'ETIMEDOUT') {
      return this.error(
        DomainExceptionCode.GatewayTimeout,
        'Payment provider request timed out',
        PAYMENT_PROVIDER_ERROR_REASON.PROVIDER_TIMEOUT,
      );
    }
    if (error.type === 'StripeConnectionError' || error.type === 'StripeRateLimitError') {
      return this.error(
        DomainExceptionCode.ServiceUnavailable,
        'Payment provider is temporarily unavailable',
        PAYMENT_PROVIDER_ERROR_REASON.PROVIDER_UNAVAILABLE,
      );
    }

    return this.error(
      DomainExceptionCode.InternalServerError,
      'Payment provider operation failed',
      'PROVIDER_FAILURE',
    );
  }

  private static error(
    code: DomainExceptionCode,
    message: string,
    reason: string,
  ): DomainException {
    return new DomainException({
      code,
      message,
      extensions: [{ field: 'reason', message: reason }],
    });
  }
}
