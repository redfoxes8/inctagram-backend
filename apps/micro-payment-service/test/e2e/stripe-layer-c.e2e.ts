import { randomBytes, randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';
import Stripe from 'stripe';
import jwt from 'jsonwebtoken';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient as PaymentPrismaClient } from '../../src/core/prisma/client';
import { PrismaClient as GatewayPrismaClient } from '../../../main-gateway-service/src/core/prisma/client';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function localDatabase(name: string, expectedDatabase: string): void {
  const url = new URL(required(name));
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
    throw new Error(`${name} must be local`);
  }
  if (url.pathname.slice(1) !== expectedDatabase)
    throw new Error(`${name} must use ${expectedDatabase}`);
}

async function main(): Promise<void> {
  dotenv.config({ path: 'apps/micro-payment-service/.env.development' });
  if (required('PAYMENT_PROVIDER_ENVIRONMENT') !== 'test') throw new Error('Provider must be test');
  const secretKey = required('STRIPE_SECRET_KEY');
  if (!secretKey.startsWith('sk_test_')) throw new Error('Stripe key must be test mode');
  localDatabase('PAYMENT_LIFECYCLE_TEST_DB_URL', 'payment_lifecycle_test');
  localDatabase('GATEWAY_LIFECYCLE_TEST_DB_URL', 'gateway_payment_lifecycle_test');
  const rabbit = new URL(required('PAYMENT_TEST_RABBIT_URL'));
  if (!['127.0.0.1', 'localhost', '::1'].includes(rabbit.hostname)) {
    throw new Error('RabbitMQ must be local');
  }

  const runId =
    process.env.PAYMENT_TEST_RUN_ID?.trim() ||
    `payment-lifecycle-${new Date().toISOString().replace(/\D/gu, '').slice(0, 14)}-${randomBytes(4).toString('hex')}`;
  const metadata = {
    testRunId: runId,
    purpose: 'payment-lifecycle-e2e',
    environment: 'local-test',
  };
  const stripe = new Stripe(secretKey, { apiVersion: '2026-06-24.dahlia' });
  const existingClockId = process.env.PAYMENT_TEST_CLOCK_ID?.trim();
  const existingCustomerId = process.env.PAYMENT_TEST_CUSTOMER_ID?.trim();
  if (existingClockId && existingCustomerId) {
    const [clock, customer] = await Promise.all([
      stripe.testHelpers.testClocks.retrieve(existingClockId),
      stripe.customers.retrieve(existingCustomerId),
    ]);
    if (
      clock.deleted ||
      customer.deleted ||
      clock.livemode ||
      customer.livemode ||
      customer.test_clock !== clock.id ||
      customer.metadata.testRunId !== runId
    ) {
      throw new Error('Existing Layer C resources failed safety validation');
    }
    const existingProducts = await stripe.products.search({
      query: `metadata['testRunId']:'${runId}'`,
      limit: 1,
    });
    const product =
      existingProducts.data[0] ??
      (await stripe.products.create({ name: `Lifecycle ${runId}`, metadata }));
    const existingPrices = await stripe.prices.list({
      product: product.id,
      active: true,
      limit: 1,
    });
    const price =
      existingPrices.data[0] ??
      (await stripe.prices.create({
        product: product.id,
        currency: 'usd',
        unit_amount: 800,
        recurring: { interval: 'week', interval_count: 1 },
        metadata,
      }));
    if (product.livemode || price.livemode) throw new Error('Unsafe catalog fixture');
    const payment = new PaymentPrismaClient({
      adapter: new PrismaPg({ connectionString: required('PAYMENT_LIFECYCLE_TEST_DB_URL') }),
    });
    const gateway = new GatewayPrismaClient({
      adapter: new PrismaPg({ connectionString: required('GATEWAY_LIFECYCLE_TEST_DB_URL') }),
    });
    const userId = randomUUID();
    const productId = randomUUID();
    await gateway.user.upsert({
      where: { id: userId },
      create: { id: userId, email: `${runId}@example.test`, isConfirmed: true },
      update: { accountType: 'PERSONAL', deletedAt: null },
    });
    await payment.product.upsert({
      where: { id: productId },
      create: {
        id: productId,
        code: `LAYER_C_${randomBytes(8).toString('hex').toUpperCase()}`,
        name: 'Layer C week',
        billingInterval: 'WEEK',
        billingIntervalCount: 1,
        priceMinor: 800,
        currency: 'USD',
      },
      update: {},
    });
    await payment.productProvider.upsert({
      where: {
        productId_provider_environment: { productId, provider: 'STRIPE', environment: 'test' },
      },
      create: {
        productId,
        provider: 'STRIPE',
        providerProductId: product.id,
        providerBillingId: price.id,
        environment: 'test',
      },
      update: { providerProductId: product.id, providerBillingId: price.id, isActive: true },
    });
    await payment.providerCustomer.upsert({
      where: { userId_provider: { userId, provider: 'STRIPE' } },
      create: { userId, provider: 'STRIPE', providerCustomerId: customer.id },
      update: { providerCustomerId: customer.id },
    });
    await Promise.all([payment.$disconnect(), gateway.$disconnect()]);
    const gatewayEnvironment = dotenv.parse(
      readFileSync('apps/main-gateway-service/.env.development'),
    );
    const jwtSecret = gatewayEnvironment.JWT_SECRET;
    if (!jwtSecret) throw new Error('Local Gateway JWT_SECRET is required');
    const accessToken = jwt.sign({ userId, deviceId: randomUUID() }, jwtSecret, { expiresIn: 300 });
    const response = await fetch('http://127.0.0.1:4278/api/v1/payments/checkout', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      body: JSON.stringify({ productId, provider: 'STRIPE', autoRenewConsent: true }),
    });
    const checkout: unknown = await response.json();
    if (!response.ok) throw new Error(`Checkout API failed with HTTP ${response.status}`);
    console.log({
      runId,
      clockId: clock.id,
      customerId: customer.id,
      stripeProductId: product.id,
      stripePriceId: price.id,
      localUserId: userId,
      localProductId: productId,
      checkout,
      livemode: false,
      resumed: true,
    });
    return;
  }
  const clock = await stripe.testHelpers.testClocks.create({
    frozen_time: Math.floor(Date.now() / 1_000),
    name: runId,
  });
  if (clock.livemode || clock.status !== 'ready') throw new Error('Unsafe Test Clock');
  const customer = await stripe.customers.create({
    test_clock: clock.id,
    payment_method: 'pm_card_visa',
    invoice_settings: { default_payment_method: 'pm_card_visa' },
    metadata,
  });
  if (customer.livemode || customer.test_clock !== clock.id) throw new Error('Unsafe Customer');
  console.log({
    runId,
    clockId: clock.id,
    customerId: customer.id,
    livemode: false,
    next: 'CHECKOUT_FIXTURE_REQUIRED',
  });
}

if (process.env.PAYMENT_TEST_STRIPE_E2E === 'true') {
  void main();
} else {
  console.log('Layer C Stripe E2E: SKIPPED (set PAYMENT_TEST_STRIPE_E2E=true to enable)');
}
