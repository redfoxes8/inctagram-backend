import { Provider } from '@nestjs/common';
import Stripe from 'stripe';
import { PaymentConfig } from '../../../../core/payment.config';

export const STRIPE_CLIENT = Symbol('STRIPE_CLIENT');
export const STRIPE_STRATEGY_CONFIGURATION = Symbol('STRIPE_STRATEGY_CONFIGURATION');

export type StripeStrategyConfiguration = Readonly<{
  environment: 'test';
  webhookSecret: string;
}>;

export const stripeClientProvider: Provider = {
  provide: STRIPE_CLIENT,
  inject: [PaymentConfig],
  useFactory: (config: PaymentConfig): Stripe =>
    new Stripe(config.stripeSecretKey, { apiVersion: '2026-06-24.dahlia' }),
};

export const stripeStrategyConfigurationProvider: Provider = {
  provide: STRIPE_STRATEGY_CONFIGURATION,
  inject: [PaymentConfig],
  useFactory: (config: PaymentConfig): StripeStrategyConfiguration => ({
    environment: config.providerEnvironment,
    webhookSecret: config.stripeWebhookSecret,
  }),
};
