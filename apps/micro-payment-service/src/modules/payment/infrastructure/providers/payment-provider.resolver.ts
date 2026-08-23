import { Inject, Injectable } from '@nestjs/common';
import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { PaymentProviderResolver } from '../../application/ports/payment-provider-resolver.port';
import { PaymentProviderStrategy } from '../../application/ports/payment-provider.strategy';
import { PAYMENT_PROVIDER_STRATEGIES } from '../../application/ports/payment-provider.tokens';
import { PAYMENT_PROVIDER_ERROR_REASON } from '../../application/ports/payment-provider.types';
import { ProviderCode } from '../../domain/value-objects/provider-code.value-object';

@Injectable()
export class PaymentProviderResolverService implements PaymentProviderResolver {
  private readonly registry: ReadonlyMap<string, PaymentProviderStrategy>;

  constructor(
    @Inject(PAYMENT_PROVIDER_STRATEGIES)
    strategies: readonly PaymentProviderStrategy[],
  ) {
    const registry = new Map<string, PaymentProviderStrategy>();
    for (const strategy of strategies) {
      const code = strategy.code.getValue();
      if (registry.has(code)) {
        throw new DomainException({
          code: DomainExceptionCode.InternalServerError,
          message: 'Duplicate payment provider registration',
        });
      }
      registry.set(code, strategy);
    }
    this.registry = registry;
  }

  public resolve(providerCode: ProviderCode): PaymentProviderStrategy {
    const strategy = this.registry.get(providerCode.getValue());
    if (strategy) return strategy;
    throw new DomainException({
      code: DomainExceptionCode.BadRequest,
      message: PAYMENT_PROVIDER_ERROR_REASON.PROVIDER_NOT_SUPPORTED,
    });
  }
}
