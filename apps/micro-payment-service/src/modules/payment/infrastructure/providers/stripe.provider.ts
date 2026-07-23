import { Injectable, Logger } from '@nestjs/common';
import { PaymentConfig } from '../../../../core/payment.config';
import Stripe, { Customer, Response, Checkout } from 'stripe';
import { UserInfoForProviderType } from './user-info-for-provder.type';
import { CreateCheckoutResponseType } from '../../domain/types/create-checkout-respone.type';
import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { IPaymentProvider } from '../../domain/interfaces/payment.provider.interface';

@Injectable()
export class StripeProvider implements IPaymentProvider {
  private logger: Logger;
  private stripe: Stripe;
  constructor(private readonly paymentConfig: PaymentConfig) {
    this.stripe = new Stripe(paymentConfig.stripeSecretKey);
    this.logger = new Logger(StripeProvider.name);
  }

  private async createCustomer(email: string): Promise<string> {
    const customer: Response<Customer> = await this.stripe.customers.create({
      email: email,
    });
    return customer.id;
  }

  async createCheckOutSession(
    planId: string,
    userInfo: UserInfoForProviderType,
  ): Promise<CreateCheckoutResponseType | false> {
    if (!userInfo.providerUserId) {
      userInfo.providerUserId = await this.createCustomer(userInfo.email);
    }
    try {
      const session: Response<Checkout.Session> = await this.stripe.checkout.sessions.create({
        success_url: this.paymentConfig.successPaymentUrl,
        return_url: this.paymentConfig.unsuccessPaymentUrl,
        customer: userInfo.providerUserId,
        customer_email: userInfo.email,
        line_items: [
          {
            price: planId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
      });

      if (!session.url) {
        throw new DomainException({
          code: DomainExceptionCode.InternalServerError,
          message: 'Stripe link for checkout was not found',
        });
      }

      if (!session.subscription) {
        throw new DomainException({
          code: DomainExceptionCode.InternalServerError,
          message:
            'Invalid format of subscription prop in Stripe checkout session creation response',
        });
      }

      const subscriptionId: string =
        typeof session.subscription === 'string' ? session.subscription : session.subscription.id;

      return {
        link: session.url,
        providerSubscriptionId: subscriptionId,
      };
    } catch (e) {
      this.logger.error({ message: `Stripe provider error on CreateCheckoutSession: ${e}` });
      return false;
    }
  }

  async cancelSubscriptionAtEndOfPeriod(providerSubscriptionId: string): Promise<boolean> {
    try {
      await this.stripe.subscriptions.update(providerSubscriptionId, {
        cancel_at_period_end: true,
      });
      return true;
    } catch (e) {
      this.logger.error({
        message: `Stripe provider error on CancelSubscriptionAtEndOfPeriod: ${e}`,
      });
      return false;
    }
  }

  async disableCancelingAtTheEndOfPeriod(providerSubscriptionId: string): Promise<boolean> {
    try {
      await this.stripe.subscriptions.update(providerSubscriptionId, {
        cancel_at_period_end: false,
      });
      return true;
    } catch (e) {
      this.logger.error({
        message: `Stripe provider error on DisableCancelingAtTheEndOfPeriod: ${e}`,
      });
      return false;
    }
  }
}
