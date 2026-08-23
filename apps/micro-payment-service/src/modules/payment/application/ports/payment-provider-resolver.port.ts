import { ProviderCode } from '../../domain/value-objects/provider-code.value-object';
import { PaymentProviderStrategy } from './payment-provider.strategy';

export abstract class PaymentProviderResolver {
  abstract resolve(providerCode: ProviderCode): PaymentProviderStrategy;
}
