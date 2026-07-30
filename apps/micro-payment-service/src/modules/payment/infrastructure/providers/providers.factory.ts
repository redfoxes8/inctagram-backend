import { PaymentTransactionProvidersDomain } from '../../domain/enums/providers.enum';
import { PaypalProvider } from './paypal.provider';
import { StripeProvider } from './stripe.provider';
import { DomainException, DomainExceptionCode } from '@inctagram/common';
import { IPaymentProvider } from '../../domain/interfaces/payment.provider.interface';
import { Type } from '@nestjs/common';

const ProvidersMap = {
  [PaymentTransactionProvidersDomain.PAYPAL]: PaypalProvider,
  [PaymentTransactionProvidersDomain.STRIPE]: StripeProvider,
};

export class ProvidersFactory {
  constructor() {}

  public getProvider(providerName: PaymentTransactionProvidersDomain): Type<IPaymentProvider> {
    const provider: Type<IPaymentProvider> = ProvidersMap[providerName];

    if (!provider) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: `Cant find provider ${providerName} in ProvidersFactory`,
      });
    }
    return provider;
  }
}
