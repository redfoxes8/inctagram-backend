import dotenv from 'dotenv';
import { randomUUID } from 'crypto';

const envFile = process.env.ENV_FILE_PATH ?? 'apps/micro-payment-service/.env.development';
dotenv.config({ path: envFile });

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for Payment test execution`);
  return value;
}

function assertLocalUrl(name: string): void {
  const value = required(name);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    throw new Error(`${name} must target local test infrastructure`);
  }
}

if (required('PAYMENT_PROVIDER_ENVIRONMENT') !== 'test') {
  throw new Error('PAYMENT_PROVIDER_ENVIRONMENT must be test');
}
if (!required('STRIPE_SECRET_KEY').startsWith('sk_test_')) {
  throw new Error('STRIPE_SECRET_KEY must be a Stripe test key');
}
assertLocalUrl('DATABASE_URL');
assertLocalUrl('PRISMA_DB_URL');
assertLocalUrl('RABBITMQ_URL');

const stripeE2eEnabled = process.env.PAYMENT_TEST_STRIPE_E2E === 'true';
const runId = process.env.PAYMENT_TEST_RUN_ID?.trim() || randomUUID();
if (stripeE2eEnabled && !process.env.PAYMENT_TEST_RUN_ID?.trim()) {
  throw new Error('PAYMENT_TEST_RUN_ID is required for opt-in Stripe E2E');
}

console.log({
  paymentProviderEnvironment: 'TEST',
  stripeSecretKey: 'TEST',
  databaseTargets: 'LOCAL',
  rabbitMqTarget: 'LOCAL',
  stripeE2e: stripeE2eEnabled ? 'OPT_IN' : 'DISABLED',
  runIdConfigured: stripeE2eEnabled ? Boolean(runId) : false,
});
