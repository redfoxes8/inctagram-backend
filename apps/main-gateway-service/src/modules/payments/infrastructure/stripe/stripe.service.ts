import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';

import { GatewayConfig } from '../../../../core/gateway.config';

@Injectable()
export class StripeService {
  private readonly stripe: Stripe;

  constructor(private readonly gatewayConfig: GatewayConfig) {
    this.stripe = new Stripe(gatewayConfig.stripeSecretKey);
  }

  constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      this.gatewayConfig.stripeWebhookSecret,
    );
  }
}
