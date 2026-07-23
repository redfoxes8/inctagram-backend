import { UserInfoForProviderType } from '../../infrastructure/providers/user-info-for-provder.type';
import { CreateCheckoutResponseType } from '../types/create-checkout-respone.type';

export interface IPaymentProvider {
  createCheckOutSession(
    planId: string,
    userInfo: UserInfoForProviderType,
  ): Promise<CreateCheckoutResponseType | false>;

  cancelSubscriptionAtEndOfPeriod(providerSubscriptionId: string): Promise<boolean>;

  disableCancelingAtTheEndOfPeriod(providerSubscriptionId: string): Promise<boolean>;
}
