'use strict';

const http = require('node:http');
const path = require('node:path');
const Stripe = require('stripe');

const API_VERSION = Stripe.API_VERSION;
const ENV_PATH = path.join(process.cwd(), 'apps/micro-payment-service/.env.development');
const SPIKE_MARKER = 'payment_slice_2';
const TEST_KEY_PREFIX = ['sk', 'test', ''].join('_');
const WEBHOOK_SECRET_PREFIX = ['whsec', ''].join('_');
const WEBHOOK_PATH = '/stripe-spike-webhook';
const WEBHOOK_PORT = 4242;
const MAX_BODY_BYTES = 1024 * 1024;

const args = process.argv.slice(2);
const mode = readArg('--mode');
const runId = readArg('--run-id');
const sessionId = readArg('--session-id');
const initialSubscriptionId = readArg('--initial-subscription-id');
const additionalSessionId = readArg('--additional-session-id');
const finalEndsAt = Number(readArg('--final-ends-at'));
const CLOCK_NAME_PREFIX = 'inctagram-payment-slice-2';

function readArg(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function loadStripe() {
  process.loadEnvFile(ENV_PATH);
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey || !secretKey.startsWith(TEST_KEY_PREFIX)) {
    throw new Error('STRIPE_SECRET_KEY is missing or is not a test-mode key');
  }

  return new Stripe(secretKey, { apiVersion: API_VERSION });
}

function requireRunId() {
  if (!runId || !/^[a-zA-Z0-9_-]{4,80}$/.test(runId)) {
    throw new Error('--run-id is required and must contain 4-80 safe characters');
  }
}

function metadata(scenario) {
  return {
    inctagram_spike: SPIKE_MARKER,
    spike_run_id: runId,
    spike_scenario: scenario,
  };
}

function isOwned(object, scenario) {
  return (
    object.metadata?.inctagram_spike === SPIKE_MARKER &&
    object.metadata?.spike_run_id === runId &&
    (!scenario || object.metadata?.spike_scenario === scenario)
  );
}

async function assertTestMode(stripe) {
  const balance = await stripe.balance.retrieve();
  if (balance.livemode !== false) {
    throw new Error('Stripe API did not confirm livemode=false');
  }
}

async function createInTestMode(stripe, create, idempotencyKey) {
  await assertTestMode(stripe);
  const object = await create(idempotencyKey);
  if (object.livemode !== false) {
    throw new Error(`Created ${object.object} did not confirm livemode=false`);
  }
  return object;
}

async function findOrCreateCustomer(stripe) {
  const customers = await stripe.customers.list({ limit: 100 });
  const existing = customers.data.find((customer) => isOwned(customer, 'shared_customer'));
  if (existing) return existing;

  return createInTestMode(
    stripe,
    (idempotencyKey) =>
      stripe.customers.create(
        {
          description: 'Disposable Inctagram Payment Slice 2 customer',
          metadata: metadata('shared_customer'),
        },
        { idempotencyKey },
      ),
    `inctagram-${runId}-customer`,
  );
}

async function findOrCreateProduct(stripe, interval) {
  const scenario = `${interval}_product`;
  const products = await stripe.products.list({ limit: 100 });
  const existing = products.data.find((product) => isOwned(product, scenario));
  if (existing) return existing;

  return createInTestMode(
    stripe,
    (idempotencyKey) =>
      stripe.products.create(
        {
          name: `Disposable ${interval.toUpperCase()} Product (${runId})`,
          metadata: metadata(scenario),
        },
        { idempotencyKey },
      ),
    `inctagram-${runId}-${interval}-product`,
  );
}

async function findOrCreateRecurringPrice(stripe, product, interval, unitAmount) {
  const scenario = `${interval}_recurring_price`;
  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
  const existing = prices.data.find((price) => isOwned(price, scenario));
  if (existing) return existing;

  return createInTestMode(
    stripe,
    (idempotencyKey) =>
      stripe.prices.create(
        {
          product: product.id,
          currency: 'usd',
          unit_amount: unitAmount,
          recurring: { interval, interval_count: 1 },
          metadata: metadata(scenario),
        },
        { idempotencyKey },
      ),
    `inctagram-${runId}-${interval}-price`,
  );
}

async function prepareInitialCheckout(stripe) {
  requireRunId();
  const customer = await findOrCreateCustomer(stripe);
  const weekProduct = await findOrCreateProduct(stripe, 'week');
  const monthProduct = await findOrCreateProduct(stripe, 'month');
  const weekPrice = await findOrCreateRecurringPrice(stripe, weekProduct, 'week', 700);
  const monthPrice = await findOrCreateRecurringPrice(stripe, monthProduct, 'month', 1100);

  const sessions = await stripe.checkout.sessions.list({ limit: 100 });
  let session = sessions.data.find(
    (candidate) => isOwned(candidate, 'initial_week_checkout') && candidate.status !== 'expired',
  );

  if (!session) {
    session = await createInTestMode(
      stripe,
      (idempotencyKey) =>
        stripe.checkout.sessions.create(
          {
            mode: 'subscription',
            customer: customer.id,
            line_items: [{ price: weekPrice.id, quantity: 1 }],
            success_url: 'https://example.com/stripe-spike/success?session_id={CHECKOUT_SESSION_ID}',
            cancel_url: 'https://example.com/stripe-spike/cancel',
            metadata: metadata('initial_week_checkout'),
            subscription_data: { metadata: metadata('initial_week_subscription') },
          },
          { idempotencyKey },
        ),
      `inctagram-${runId}-initial-week-checkout`,
    );
  }

  const ownedObjects = [
    [customer, 'shared_customer'],
    [weekProduct, 'week_product'],
    [weekPrice, 'week_recurring_price'],
    [monthProduct, 'month_product'],
    [monthPrice, 'month_recurring_price'],
    [session, 'initial_week_checkout'],
  ];
  for (const [object, scenario] of ownedObjects) {
    if (object.livemode !== false || !isOwned(object, scenario)) {
      throw new Error(`${object.object} failed marker/livemode verification`);
    }
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        runId,
        apiVersion: API_VERSION,
        livemode: session.livemode,
        customerId: customer.id,
        weekProductId: weekProduct.id,
        weekPriceId: weekPrice.id,
        monthProductId: monthProduct.id,
        monthPriceId: monthPrice.id,
        checkoutSessionId: session.id,
        checkoutUrl: session.url,
      },
      null,
      2,
    )}\n`,
  );
}

function objectId(value) {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

async function inspectInitialCheckout(stripe) {
  requireRunId();
  if (!sessionId || !sessionId.startsWith('cs_')) throw new Error('--session-id is required');

  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['customer', 'subscription'],
  });
  if (session.livemode !== false || !isOwned(session, 'initial_week_checkout')) {
    throw new Error('Initial Checkout Session failed marker/livemode verification');
  }

  const subscriptionId = objectId(session.subscription);
  if (!subscriptionId) throw new Error('Completed initial Checkout has no Subscription ID');
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['latest_invoice'],
  });
  if (subscription.livemode !== false || !isOwned(subscription, 'initial_week_subscription')) {
    throw new Error('Initial Subscription failed marker/livemode verification');
  }

  const invoiceId = objectId(subscription.latest_invoice);
  if (!invoiceId) throw new Error('Initial Subscription has no latest Invoice ID');
  const invoice = await stripe.invoices.retrieve(invoiceId);
  if (invoice.livemode !== false) throw new Error('Initial Invoice is not test-mode');

  const invoicePayments = await stripe.invoicePayments.list({
    invoice: invoice.id,
    status: 'paid',
    limit: 10,
  });
  const invoicePayment = invoicePayments.data[0] ?? null;
  const paymentIntentId = objectId(invoicePayment?.payment?.payment_intent);
  const paymentIntent = paymentIntentId
    ? await stripe.paymentIntents.retrieve(paymentIntentId)
    : null;
  if (paymentIntent && paymentIntent.livemode !== false) {
    throw new Error('Initial PaymentIntent is not test-mode');
  }

  const firstItem = subscription.items.data[0] ?? null;
  process.stdout.write(
    `${JSON.stringify(
      {
        runId,
        checkout: {
          id: session.id,
          created: session.created,
          status: session.status,
          paymentStatus: session.payment_status,
          customerId: objectId(session.customer),
          subscriptionId,
        },
        subscription: {
          id: subscription.id,
          created: subscription.created,
          status: subscription.status,
          currentPeriodStart: firstItem?.current_period_start ?? null,
          currentPeriodEnd: firstItem?.current_period_end ?? null,
          latestInvoiceId: invoice.id,
          defaultPaymentMethodId: objectId(subscription.default_payment_method),
        },
        invoice: {
          id: invoice.id,
          created: invoice.created,
          status: invoice.status,
          paid: invoice.paid,
          amountPaid: invoice.amount_paid,
          currency: invoice.currency,
        },
        invoicePayment: invoicePayment
          ? {
              id: invoicePayment.id,
              created: invoicePayment.created,
              status: invoicePayment.status,
              amountPaid: invoicePayment.amount_paid,
              paymentIntentId,
              paidAt: invoicePayment.status_transitions.paid_at,
            }
          : null,
        paymentIntent: paymentIntent
          ? {
              id: paymentIntent.id,
              created: paymentIntent.created,
              status: paymentIntent.status,
              amount: paymentIntent.amount,
              amountReceived: paymentIntent.amount_received,
              currency: paymentIntent.currency,
              paymentMethodId: objectId(paymentIntent.payment_method),
            }
          : null,
      },
      null,
      2,
    )}\n`,
  );
}

async function prepareAdditionalCheckout(stripe) {
  requireRunId();
  const customer = await findOrCreateCustomer(stripe);
  const monthProduct = await findOrCreateProduct(stripe, 'month');
  const monthPrice = await findOrCreateRecurringPrice(stripe, monthProduct, 'month', 1100);

  const sessions = await stripe.checkout.sessions.list({ limit: 100 });
  let session = sessions.data.find(
    (candidate) => isOwned(candidate, 'additional_month_checkout') && candidate.status !== 'expired',
  );

  if (!session) {
    session = await createInTestMode(
      stripe,
      (idempotencyKey) =>
        stripe.checkout.sessions.create(
          {
            mode: 'payment',
            customer: customer.id,
            line_items: [
              {
                price_data: {
                  currency: 'usd',
                  product: monthProduct.id,
                  unit_amount: 1100,
                },
                quantity: 1,
              },
            ],
            payment_intent_data: {
              setup_future_usage: 'off_session',
              metadata: metadata('additional_month_payment_intent'),
            },
            success_url: 'https://example.com/stripe-spike/additional-success?session_id={CHECKOUT_SESSION_ID}',
            cancel_url: 'https://example.com/stripe-spike/additional-cancel',
            metadata: metadata('additional_month_checkout'),
          },
          { idempotencyKey },
        ),
      `inctagram-${runId}-additional-month-checkout`,
    );
  }

  if (
    session.livemode !== false ||
    !isOwned(session, 'additional_month_checkout') ||
    objectId(session.customer) !== customer.id
  ) {
    throw new Error('Additional Checkout Session failed customer/marker/livemode verification');
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        runId,
        apiVersion: API_VERSION,
        livemode: session.livemode,
        customerId: customer.id,
        monthProductId: monthProduct.id,
        futureRecurringMonthPriceId: monthPrice.id,
        checkoutSessionId: session.id,
        checkoutUrl: session.url,
        immediateAmount: 1100,
        currency: 'usd',
        mode: session.mode,
      },
      null,
      2,
    )}\n`,
  );
}

async function inspectAdditionalCheckout(stripe) {
  requireRunId();
  if (!sessionId || !sessionId.startsWith('cs_')) throw new Error('--session-id is required');

  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['customer', 'payment_intent'],
  });
  if (session.livemode !== false || !isOwned(session, 'additional_month_checkout')) {
    throw new Error('Additional Checkout Session failed marker/livemode verification');
  }

  const customerId = objectId(session.customer);
  const paymentIntentId = objectId(session.payment_intent);
  if (!customerId || !paymentIntentId) {
    throw new Error('Completed additional Checkout lacks Customer or PaymentIntent');
  }

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (paymentIntent.livemode !== false || !isOwned(paymentIntent, 'additional_month_payment_intent')) {
    throw new Error('Additional PaymentIntent failed marker/livemode verification');
  }
  const paymentMethodId = objectId(paymentIntent.payment_method);
  if (!paymentMethodId) throw new Error('Additional PaymentIntent lacks PaymentMethod');
  const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

  const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
  const immediatelyBillingSubscriptions = subscriptions.data.filter((subscription) =>
    ['active', 'trialing', 'past_due', 'unpaid', 'incomplete'].includes(subscription.status),
  );
  const initialSubscription = subscriptions.data.find((subscription) =>
    isOwned(subscription, 'initial_week_subscription'),
  );
  const initialInvoices = initialSubscription
    ? await stripe.invoices.list({ subscription: initialSubscription.id, limit: 100 })
    : { data: [] };

  process.stdout.write(
    `${JSON.stringify(
      {
        runId,
        checkout: {
          id: session.id,
          created: session.created,
          status: session.status,
          paymentStatus: session.payment_status,
          mode: session.mode,
          customerId,
          amountTotal: session.amount_total,
          currency: session.currency,
          subscriptionId: objectId(session.subscription),
        },
        paymentIntent: {
          id: paymentIntent.id,
          created: paymentIntent.created,
          status: paymentIntent.status,
          amount: paymentIntent.amount,
          amountReceived: paymentIntent.amount_received,
          currency: paymentIntent.currency,
          setupFutureUsage: paymentIntent.setup_future_usage,
          customerId: objectId(paymentIntent.customer),
          paymentMethodId,
        },
        paymentMethod: {
          id: paymentMethod.id,
          livemode: paymentMethod.livemode,
          customerId: objectId(paymentMethod.customer),
          type: paymentMethod.type,
        },
        subscriptions: {
          totalForCustomer: subscriptions.data.length,
          immediatelyBillingCount: immediatelyBillingSubscriptions.length,
          ids: subscriptions.data.map((subscription) => ({
            id: subscription.id,
            status: subscription.status,
            scenario: subscription.metadata?.spike_scenario ?? null,
          })),
        },
        initialSubscriptionInvoices: initialInvoices.data.map((invoice) => ({
          id: invoice.id,
          status: invoice.status,
          amountPaid: invoice.amount_paid,
          currency: invoice.currency,
          created: invoice.created,
        })),
      },
      null,
      2,
    )}\n`,
  );
}

async function configureRealAlignment(stripe) {
  requireRunId();
  if (!initialSubscriptionId?.startsWith('sub_')) {
    throw new Error('--initial-subscription-id is required');
  }
  if (!additionalSessionId?.startsWith('cs_')) {
    throw new Error('--additional-session-id is required');
  }
  if (!Number.isInteger(finalEndsAt) || finalEndsAt <= 0) {
    throw new Error('--final-ends-at must be a Unix timestamp');
  }

  const initialSubscription = await stripe.subscriptions.retrieve(initialSubscriptionId);
  if (
    initialSubscription.livemode !== false ||
    !isOwned(initialSubscription, 'initial_week_subscription')
  ) {
    throw new Error('Initial Subscription failed marker/livemode verification');
  }
  const initialPeriodEnd = initialSubscription.items.data[0]?.current_period_end;
  if (!initialPeriodEnd || finalEndsAt <= initialPeriodEnd) {
    throw new Error('Final local endsAt must be after the paid initial period');
  }

  const additionalSession = await stripe.checkout.sessions.retrieve(additionalSessionId, {
    expand: ['payment_intent'],
  });
  const additionalPaymentIntentId = objectId(additionalSession.payment_intent);
  if (
    additionalSession.livemode !== false ||
    !isOwned(additionalSession, 'additional_month_checkout') ||
    additionalSession.status !== 'complete' ||
    additionalSession.payment_status !== 'paid' ||
    !additionalPaymentIntentId
  ) {
    throw new Error('Additional Checkout is not a verified paid test-mode Session');
  }
  const paymentIntent = await stripe.paymentIntents.retrieve(additionalPaymentIntentId);
  const paymentMethodId = objectId(paymentIntent.payment_method);
  const customerId = objectId(additionalSession.customer);
  if (
    paymentIntent.status !== 'succeeded' ||
    paymentIntent.setup_future_usage !== 'off_session' ||
    objectId(paymentIntent.customer) !== customerId ||
    !paymentMethodId
  ) {
    throw new Error('Additional payment is not suitable for future off-session use');
  }

  const monthProduct = await findOrCreateProduct(stripe, 'month');
  const monthPrice = await findOrCreateRecurringPrice(stripe, monthProduct, 'month', 1100);

  const updatedInitial = await stripe.subscriptions.update(initialSubscription.id, {
    cancel_at_period_end: true,
    metadata: { spike_alignment: 'cancel_after_paid_initial_period' },
  });

  const schedules = await stripe.subscriptionSchedules.list({ limit: 100 });
  let schedule = schedules.data.find((candidate) => isOwned(candidate, 'future_month_schedule'));
  if (!schedule) {
    schedule = await createInTestMode(
      stripe,
      (idempotencyKey) =>
        stripe.subscriptionSchedules.create(
          {
            customer: customerId,
            start_date: finalEndsAt,
            end_behavior: 'release',
            default_settings: {
              collection_method: 'charge_automatically',
              default_payment_method: paymentMethodId,
            },
            phases: [
              {
                items: [{ price: monthPrice.id, quantity: 1 }],
                duration: { interval: 'month', interval_count: 1 },
                proration_behavior: 'none',
                metadata: metadata('future_month_subscription'),
              },
            ],
            metadata: metadata('future_month_schedule'),
          },
          { idempotencyKey },
        ),
      `inctagram-${runId}-future-month-schedule`,
    );
  }

  if (
    schedule.livemode !== false ||
    !isOwned(schedule, 'future_month_schedule') ||
    schedule.status !== 'not_started' ||
    objectId(schedule.subscription) !== null ||
    schedule.phases[0]?.start_date !== finalEndsAt
  ) {
    throw new Error('Future Schedule failed marker/status/start verification');
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        runId,
        customerId,
        initialSubscription: {
          id: updatedInitial.id,
          status: updatedInitial.status,
          cancelAtPeriodEnd: updatedInitial.cancel_at_period_end,
          paidPeriodEnd: initialPeriodEnd,
        },
        additionalPaymentIntentId,
        savedPaymentMethodId: paymentMethodId,
        futureSchedule: {
          id: schedule.id,
          status: schedule.status,
          subscriptionId: objectId(schedule.subscription),
          startDate: schedule.phases[0].start_date,
          priceId: monthPrice.id,
          interval: monthPrice.recurring?.interval ?? null,
          intervalCount: monthPrice.recurring?.interval_count ?? null,
        },
        noProviderChargeWindow: {
          startsAt: initialPeriodEnd,
          endsAt: finalEndsAt,
        },
      },
      null,
      2,
    )}\n`,
  );
}

function addUtcCalendarMonth(timestamp) {
  const date = new Date(timestamp * 1000);
  const originalDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(originalDay, lastDay));
  return Math.floor(date.getTime() / 1000);
}

async function waitForClock(stripe, clockId) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const clock = await stripe.testHelpers.testClocks.retrieve(clockId);
    if (clock.status === 'ready') return clock;
    if (clock.status === 'internal_failure') {
      throw new Error(`Test Clock ${clockId} entered internal_failure`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for Test Clock ${clockId}`);
}

async function advanceClock(stripe, clockId, frozenTime) {
  await stripe.testHelpers.testClocks.advance(clockId, { frozen_time: frozenTime });
  return waitForClock(stripe, clockId);
}

async function advanceClockInSteps(stripe, clock, target) {
  const maxStep = 13 * 24 * 60 * 60;
  let current = clock;
  while (current.frozen_time < target) {
    current = await advanceClock(
      stripe,
      current.id,
      Math.min(target, current.frozen_time + maxStep),
    );
  }
  return current;
}

async function summarizeClockCharges(stripe, customerId) {
  const paymentIntents = await stripe.paymentIntents.list({ customer: customerId, limit: 100 });
  const invoices = await stripe.invoices.list({ customer: customerId, limit: 100 });
  return {
    paymentIntents: paymentIntents.data.map((intent) => ({
      id: intent.id,
      status: intent.status,
      amount: intent.amount,
      amountReceived: intent.amount_received,
      created: intent.created,
      scenario: intent.metadata?.spike_scenario ?? null,
    })),
    invoices: invoices.data.map((invoice) => ({
      id: invoice.id,
      status: invoice.status,
      amountPaid: invoice.amount_paid,
      created: invoice.created,
      subscriptionId: objectId(invoice.subscription),
    })),
  };
}

async function runClockEquivalent(stripe) {
  requireRunId();
  await assertTestMode(stripe);
  const clockName = `${CLOCK_NAME_PREFIX}-${runId}`;
  const clocks = await stripe.testHelpers.testClocks.list({ limit: 100 });
  let clock = clocks.data.find((candidate) => candidate.name === clockName);
  if (!clock) {
    clock = await stripe.testHelpers.testClocks.create(
      { frozen_time: Math.floor(Date.now() / 1000), name: clockName },
      { idempotencyKey: `inctagram-${runId}-clock` },
    );
  }
  if (clock.livemode !== false) throw new Error('Test Clock did not confirm livemode=false');
  clock = await waitForClock(stripe, clock.id);

  const customers = await stripe.customers.list({ test_clock: clock.id, limit: 100 });
  let customer = customers.data.find((candidate) => isOwned(candidate, 'clock_customer'));
  if (!customer) {
    customer = await createInTestMode(
      stripe,
      (idempotencyKey) =>
        stripe.customers.create(
          {
            test_clock: clock.id,
            description: 'Disposable Inctagram Payment Slice 2 Test Clock customer',
            metadata: metadata('clock_customer'),
          },
          { idempotencyKey },
        ),
      `inctagram-${runId}-clock-customer`,
    );
  }

  const paymentMethods = await stripe.paymentMethods.list({ customer: customer.id, type: 'card' });
  let paymentMethod = paymentMethods.data[0];
  if (!paymentMethod) {
    paymentMethod = await stripe.paymentMethods.attach('pm_card_visa', { customer: customer.id });
    customer = await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: paymentMethod.id },
    });
  }

  const weekProduct = await findOrCreateProduct(stripe, 'week');
  const monthProduct = await findOrCreateProduct(stripe, 'month');
  const weekPrice = await findOrCreateRecurringPrice(stripe, weekProduct, 'week', 700);
  const monthPrice = await findOrCreateRecurringPrice(stripe, monthProduct, 'month', 1100);

  const subscriptions = await stripe.subscriptions.list({ customer: customer.id, status: 'all' });
  let initialSubscription = subscriptions.data.find((candidate) =>
    isOwned(candidate, 'clock_initial_week_subscription'),
  );
  if (!initialSubscription) {
    initialSubscription = await createInTestMode(
      stripe,
      (idempotencyKey) =>
        stripe.subscriptions.create(
          {
            customer: customer.id,
            items: [{ price: weekPrice.id }],
            default_payment_method: paymentMethod.id,
            payment_behavior: 'error_if_incomplete',
            metadata: metadata('clock_initial_week_subscription'),
          },
          { idempotencyKey },
        ),
      `inctagram-${runId}-clock-initial-subscription`,
    );
  }
  const initialPeriodEnd = initialSubscription.items.data[0]?.current_period_end;
  if (!initialPeriodEnd) throw new Error('Clock Subscription has no current_period_end');
  const clockFinalEndsAt = addUtcCalendarMonth(initialPeriodEnd);

  const intents = await stripe.paymentIntents.list({ customer: customer.id, limit: 100 });
  let prepaidIntent = intents.data.find((candidate) => isOwned(candidate, 'clock_prepaid_month'));
  if (!prepaidIntent) {
    prepaidIntent = await createInTestMode(
      stripe,
      (idempotencyKey) =>
        stripe.paymentIntents.create(
          {
            amount: 1100,
            currency: 'usd',
            customer: customer.id,
            payment_method: paymentMethod.id,
            confirm: true,
            off_session: true,
            metadata: metadata('clock_prepaid_month'),
          },
          { idempotencyKey },
        ),
      `inctagram-${runId}-clock-prepaid-month`,
    );
  }
  if (prepaidIntent.status !== 'succeeded' || prepaidIntent.amount_received !== 1100) {
    throw new Error('Clock prepaid equivalent payment did not succeed for 1100 minor units');
  }

  initialSubscription = await stripe.subscriptions.update(initialSubscription.id, {
    cancel_at_period_end: true,
  });
  const schedules = await stripe.subscriptionSchedules.list({ customer: customer.id, limit: 100 });
  let schedule = schedules.data.find((candidate) => isOwned(candidate, 'clock_future_month_schedule'));
  if (!schedule) {
    schedule = await createInTestMode(
      stripe,
      (idempotencyKey) =>
        stripe.subscriptionSchedules.create(
          {
            customer: customer.id,
            start_date: clockFinalEndsAt,
            end_behavior: 'release',
            default_settings: {
              collection_method: 'charge_automatically',
              default_payment_method: paymentMethod.id,
            },
            phases: [{
              items: [{ price: monthPrice.id, quantity: 1 }],
              duration: { interval: 'month', interval_count: 1 },
              proration_behavior: 'none',
              metadata: metadata('clock_future_month_subscription'),
            }],
            metadata: metadata('clock_future_month_schedule'),
          },
          { idempotencyKey },
        ),
      `inctagram-${runId}-clock-future-schedule`,
    );
  }

  const checkpoints = [];
  for (const target of [initialPeriodEnd - 1, initialPeriodEnd + 1, clockFinalEndsAt - 1, clockFinalEndsAt]) {
    clock = await advanceClock(stripe, clock.id, target);
    const currentSchedule = await stripe.subscriptionSchedules.retrieve(schedule.id);
    const currentInitial = await stripe.subscriptions.retrieve(initialSubscription.id);
    checkpoints.push({
      frozenTime: clock.frozen_time,
      initialStatus: currentInitial.status,
      scheduleStatus: currentSchedule.status,
      scheduledSubscriptionId: objectId(currentSchedule.subscription),
      charges: await summarizeClockCharges(stripe, customer.id),
    });
  }

  schedule = await stripe.subscriptionSchedules.retrieve(schedule.id);
  const renewalSubscriptionId = objectId(schedule.subscription);
  if (!renewalSubscriptionId) throw new Error('Future Schedule did not create a Subscription at boundary');
  const renewalSubscription = await stripe.subscriptions.retrieve(renewalSubscriptionId);

  process.stdout.write(`${JSON.stringify({
    runId,
    proofBoundary: 'API-created Test Clock equivalent; not a hosted Checkout execution',
    clock: { id: clock.id, livemode: clock.livemode, status: clock.status },
    customerId: customer.id,
    paymentMethodId: paymentMethod.id,
    initialSubscriptionId: initialSubscription.id,
    prepaidPaymentIntentId: prepaidIntent.id,
    scheduleId: schedule.id,
    renewalSubscriptionId,
    weekEndsAt: initialPeriodEnd,
    finalLocalEndsAt: clockFinalEndsAt,
    renewalPriceId: objectId(renewalSubscription.items.data[0]?.price),
    expectedMonthPriceId: monthPrice.id,
    checkpoints,
  }, null, 2)}\n`);
}

async function finishClockEquivalent(stripe) {
  requireRunId();
  await assertTestMode(stripe);
  const clockName = `${CLOCK_NAME_PREFIX}-${runId}`;
  const clocks = await stripe.testHelpers.testClocks.list({ limit: 100 });
  let clock = clocks.data.find((candidate) => candidate.name === clockName);
  if (!clock) throw new Error('Owned Test Clock was not found');
  clock = await waitForClock(stripe, clock.id);

  const customers = await stripe.customers.list({ test_clock: clock.id, limit: 100 });
  const customer = customers.data.find((candidate) => isOwned(candidate, 'clock_customer'));
  if (!customer) throw new Error('Owned Test Clock Customer was not found');
  const schedules = await stripe.subscriptionSchedules.list({ customer: customer.id, limit: 100 });
  let schedule = schedules.data.find((candidate) => isOwned(candidate, 'clock_future_month_schedule'));
  if (!schedule) throw new Error('Owned Test Clock Schedule was not found');

  const boundary = schedule.phases[0]?.start_date;
  if (!boundary) throw new Error('Schedule boundary was not found');
  if (clock.frozen_time < boundary + 3600) {
    clock = await advanceClock(stripe, clock.id, boundary + 3600);
  }
  schedule = await stripe.subscriptionSchedules.retrieve(schedule.id);
  const renewalSubscriptionId = objectId(schedule.subscription) ?? objectId(schedule.released_subscription);
  if (!renewalSubscriptionId) throw new Error('Renewal Subscription was not found after boundary');
  let renewalSubscription = await stripe.subscriptions.retrieve(renewalSubscriptionId);
  const successfulBoundaryState = {
    frozenTime: clock.frozen_time,
    subscriptionStatus: renewalSubscription.status,
    charges: await summarizeClockCharges(stripe, customer.id),
  };

  let failingPaymentMethod = (await stripe.paymentMethods.list({ customer: customer.id, type: 'card' }))
    .data.find((candidate) => candidate.metadata?.spike_scenario === 'clock_failing_payment_method');
  if (!failingPaymentMethod) {
    failingPaymentMethod = await stripe.paymentMethods.attach('pm_card_chargeCustomerFail', {
      customer: customer.id,
    });
    failingPaymentMethod = await stripe.paymentMethods.update(failingPaymentMethod.id, {
      metadata: metadata('clock_failing_payment_method'),
    });
  }
  await stripe.customers.update(customer.id, {
    invoice_settings: { default_payment_method: failingPaymentMethod.id },
  });
  renewalSubscription = await stripe.subscriptions.update(renewalSubscription.id, {
    default_payment_method: failingPaymentMethod.id,
  });
  const renewalPeriodEnd = renewalSubscription.items.data[0]?.current_period_end;
  if (!renewalPeriodEnd) throw new Error('Renewal Subscription has no period end');
  if (clock.frozen_time < renewalPeriodEnd) {
    clock = await advanceClock(stripe, clock.id, renewalPeriodEnd);
  }
  if (clock.frozen_time < renewalPeriodEnd + 3600) {
    clock = await advanceClock(stripe, clock.id, renewalPeriodEnd + 3600);
  }
  renewalSubscription = await stripe.subscriptions.retrieve(renewalSubscription.id);
  const failedRenewalState = {
    frozenTime: clock.frozen_time,
    subscriptionStatus: renewalSubscription.status,
    charges: await summarizeClockCharges(stripe, customer.id),
  };

  const canceledSubscription = await stripe.subscriptions.cancel(renewalSubscription.id, {
    invoice_now: false,
    prorate: false,
  });
  process.stdout.write(`${JSON.stringify({
    runId,
    proofBoundary: 'API-created Test Clock equivalent; not a hosted Checkout execution',
    clockId: clock.id,
    customerId: customer.id,
    scheduleId: schedule.id,
    renewalSubscriptionId: renewalSubscription.id,
    successfulBoundaryState,
    failingPaymentMethodId: failingPaymentMethod.id,
    renewalPeriodEnd,
    failedRenewalState,
    providerCancellation: {
      subscriptionId: canceledSubscription.id,
      status: canceledSubscription.status,
      canceledAt: canceledSubscription.canceled_at,
    },
  }, null, 2)}\n`);
}

async function createFutureSchedule({ stripe, customerId, paymentMethodId, priceId, startDate, scenario }) {
  return createInTestMode(
    stripe,
    (idempotencyKey) =>
      stripe.subscriptionSchedules.create(
        {
          customer: customerId,
          start_date: startDate,
          end_behavior: 'release',
          default_settings: {
            collection_method: 'charge_automatically',
            default_payment_method: paymentMethodId,
          },
          phases: [{
            items: [{ price: priceId, quantity: 1 }],
            duration: { interval: 'month', interval_count: 1 },
            proration_behavior: 'none',
            metadata: metadata(`${scenario}_subscription`),
          }],
          metadata: metadata(scenario),
        },
        { idempotencyKey },
      ),
    `inctagram-${runId}-${scenario}`,
  );
}

async function runAutoRenewLifecycle(stripe) {
  requireRunId();
  await assertTestMode(stripe);
  const clockName = `${CLOCK_NAME_PREFIX}-${runId}`;
  let clock = (await stripe.testHelpers.testClocks.list({ limit: 100 })).data.find(
    (candidate) => candidate.name === clockName,
  );
  if (!clock) {
    clock = await stripe.testHelpers.testClocks.create(
      { frozen_time: Math.floor(Date.now() / 1000), name: clockName },
      { idempotencyKey: `inctagram-${runId}-clock` },
    );
  }
  clock = await waitForClock(stripe, clock.id);

  let customer = (await stripe.customers.list({ test_clock: clock.id, limit: 100 })).data.find(
    (candidate) => isOwned(candidate, 'lifecycle_customer'),
  );
  if (!customer) {
    customer = await createInTestMode(
      stripe,
      (idempotencyKey) => stripe.customers.create({
        test_clock: clock.id,
        description: 'Disposable Slice 2 auto-renew lifecycle customer',
        metadata: metadata('lifecycle_customer'),
      }, { idempotencyKey }),
      `inctagram-${runId}-customer`,
    );
  }
  let paymentMethod = (await stripe.paymentMethods.list({ customer: customer.id, type: 'card' })).data[0];
  if (!paymentMethod) {
    paymentMethod = await stripe.paymentMethods.attach('pm_card_visa', { customer: customer.id });
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: paymentMethod.id },
    });
  }

  const weekProduct = await findOrCreateProduct(stripe, 'week');
  const monthProduct = await findOrCreateProduct(stripe, 'month');
  const weekPrice = await findOrCreateRecurringPrice(stripe, weekProduct, 'week', 700);
  const monthPrice = await findOrCreateRecurringPrice(stripe, monthProduct, 'month', 1100);
  let initial = (await stripe.subscriptions.list({ customer: customer.id, status: 'all' })).data.find(
    (candidate) => isOwned(candidate, 'lifecycle_initial_week'),
  );
  if (!initial) {
    initial = await createInTestMode(
      stripe,
      (idempotencyKey) => stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: weekPrice.id }],
        default_payment_method: paymentMethod.id,
        payment_behavior: 'error_if_incomplete',
        metadata: metadata('lifecycle_initial_week'),
      }, { idempotencyKey }),
      `inctagram-${runId}-initial-week`,
    );
  }
  const weekEnd = initial.items.data[0].current_period_end;
  const oldBoundary = addUtcCalendarMonth(weekEnd);
  await stripe.subscriptions.update(initial.id, { cancel_at_period_end: true });

  let monthPayment = (await stripe.paymentIntents.list({ customer: customer.id, limit: 100 })).data.find(
    (candidate) => isOwned(candidate, 'lifecycle_prepaid_month'),
  );
  if (!monthPayment) {
    monthPayment = await createInTestMode(
      stripe,
      (idempotencyKey) => stripe.paymentIntents.create({
        amount: 1100, currency: 'usd', customer: customer.id,
        payment_method: paymentMethod.id, confirm: true, off_session: true,
        metadata: metadata('lifecycle_prepaid_month'),
      }, { idempotencyKey }),
      `inctagram-${runId}-prepaid-month`,
    );
  }
  const baseline = await summarizeClockCharges(stripe, customer.id);
  let originalSchedule = await createFutureSchedule({
    stripe, customerId: customer.id, paymentMethodId: paymentMethod.id,
    priceId: monthPrice.id, startDate: oldBoundary, scenario: 'lifecycle_original_schedule',
  });
  originalSchedule = await stripe.subscriptionSchedules.retrieve(originalSchedule.id);

  const disabledSchedule = originalSchedule.status === 'not_started'
    ? await stripe.subscriptionSchedules.cancel(originalSchedule.id)
    : originalSchedule;
  const afterDisable = await summarizeClockCharges(stripe, customer.id);
  let reenabledSchedule = await createFutureSchedule({
    stripe, customerId: customer.id, paymentMethodId: paymentMethod.id,
    priceId: monthPrice.id, startDate: oldBoundary, scenario: 'lifecycle_reenabled_schedule',
  });
  reenabledSchedule = await stripe.subscriptionSchedules.retrieve(reenabledSchedule.id);
  const afterReenable = await summarizeClockCharges(stripe, customer.id);

  let weekPayment = (await stripe.paymentIntents.list({ customer: customer.id, limit: 100 })).data.find(
    (candidate) => isOwned(candidate, 'lifecycle_second_queued_week'),
  );
  if (!weekPayment) {
    weekPayment = await createInTestMode(
      stripe,
      (idempotencyKey) => stripe.paymentIntents.create({
        amount: 700, currency: 'usd', customer: customer.id,
        payment_method: paymentMethod.id, confirm: true, off_session: true,
        metadata: metadata('lifecycle_second_queued_week'),
      }, { idempotencyKey }),
      `inctagram-${runId}-second-queued-week`,
    );
  }
  const canceledForMove = reenabledSchedule.status === 'not_started'
    ? await stripe.subscriptionSchedules.cancel(reenabledSchedule.id)
    : reenabledSchedule;
  const newBoundary = oldBoundary + 7 * 24 * 60 * 60;
  const movedSchedule = await createFutureSchedule({
    stripe, customerId: customer.id, paymentMethodId: paymentMethod.id,
    priceId: weekPrice.id, startDate: newBoundary, scenario: 'lifecycle_moved_week_schedule',
  });
  const allSchedules = await stripe.subscriptionSchedules.list({ customer: customer.id, limit: 100 });
  const futureSchedules = allSchedules.data.filter((candidate) =>
    ['not_started', 'active'].includes(candidate.status),
  );
  if (futureSchedules.length !== 1 || futureSchedules[0].id !== movedSchedule.id) {
    throw new Error('Expected exactly one future Schedule after rescheduling');
  }

  clock = await advanceClockInSteps(stripe, clock, newBoundary - 1);
  const beforeBoundary = await summarizeClockCharges(stripe, customer.id);
  clock = await advanceClock(stripe, clock.id, newBoundary);
  const activeSchedule = await stripe.subscriptionSchedules.retrieve(movedSchedule.id);
  const invoices = await stripe.invoices.list({ customer: customer.id, limit: 100 });
  const boundaryInvoice = invoices.data.find((invoice) => invoice.created === newBoundary);
  if (!boundaryInvoice || boundaryInvoice.status !== 'draft') {
    throw new Error('Expected one draft invoice at the moved boundary');
  }
  const finalizeKey = `inctagram-${runId}-finalize-${boundaryInvoice.id}`;
  const finalizedOnce = await stripe.invoices.finalizeInvoice(
    boundaryInvoice.id, { auto_advance: true }, { idempotencyKey: finalizeKey },
  );
  const finalizedTwice = await stripe.invoices.finalizeInvoice(
    boundaryInvoice.id, { auto_advance: true }, { idempotencyKey: finalizeKey },
  );
  let paidInvoice = finalizedTwice;
  for (let attempt = 0; attempt < 30 && paidInvoice.status !== 'paid'; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    paidInvoice = await stripe.invoices.retrieve(boundaryInvoice.id);
  }
  const invoicePayments = await stripe.invoicePayments.list({ invoice: boundaryInvoice.id, limit: 10 });
  const invoicePayment = invoicePayments.data[0] ?? null;
  const paymentIntentId = objectId(invoicePayment?.payment?.payment_intent);
  const paymentIntent = paymentIntentId ? await stripe.paymentIntents.retrieve(paymentIntentId) : null;

  process.stdout.write(`${JSON.stringify({
    runId,
    proofBoundary: 'API-created Test Clock equivalent; no hosted Checkout',
    clockId: clock.id,
    customerId: customer.id,
    savedPaymentMethodId: paymentMethod.id,
    disable: {
      scheduleId: disabledSchedule.id, status: disabledSchedule.status,
      paymentIntentCountBefore: baseline.paymentIntents.length,
      paymentIntentCountAfter: afterDisable.paymentIntents.length,
      invoiceCountBefore: baseline.invoices.length, invoiceCountAfter: afterDisable.invoices.length,
    },
    reenable: {
      scheduleId: reenabledSchedule.id, statusBeforeMove: canceledForMove.status,
      boundary: oldBoundary, paymentMethodId: paymentMethod.id,
      immediatePaymentIntentDelta: afterReenable.paymentIntents.length - afterDisable.paymentIntents.length,
      immediateInvoiceDelta: afterReenable.invoices.length - afterDisable.invoices.length,
    },
    reschedule: {
      additionalPaymentIntentId: weekPayment.id, amountReceived: weekPayment.amount_received,
      oldBoundary, newBoundary, scheduleId: movedSchedule.id,
      futureScheduleCount: futureSchedules.length,
      futurePriceId: objectId(activeSchedule.phases[0]?.items[0]?.price),
      expectedLatestPriceId: weekPrice.id,
      countsOneSecondBefore: {
        paymentIntents: beforeBoundary.paymentIntents.length,
        invoices: beforeBoundary.invoices.length,
      },
    },
    invoiceTiming: {
      scheduleActivatedAt: newBoundary,
      invoiceId: boundaryInvoice.id,
      invoiceCreatedAt: boundaryInvoice.created,
      automaticFinalizesAt: boundaryInvoice.automatically_finalizes_at,
      explicitFinalizeFirstStatus: finalizedOnce.status,
      explicitFinalizeSecondId: finalizedTwice.id,
      finalizedAt: paidInvoice.status_transitions.finalized_at,
      paymentAttempted: paidInvoice.attempted,
      paymentIntentId,
      paymentIntentStatus: paymentIntent?.status ?? null,
      paidAt: paidInvoice.status_transitions.paid_at,
      amountPaid: paidInvoice.amount_paid,
    },
  }, null, 2)}\n`);
}

async function prepareFailedAdditionalCheckout(stripe) {
  requireRunId();
  const customer = await findOrCreateCustomer(stripe);
  const monthProduct = await findOrCreateProduct(stripe, 'month');
  const sessions = await stripe.checkout.sessions.list({ limit: 100 });
  let session = sessions.data.find((candidate) => isOwned(candidate, 'failed_additional_checkout'));
  if (!session) {
    session = await createInTestMode(
      stripe,
      (idempotencyKey) => stripe.checkout.sessions.create({
        mode: 'payment', customer: customer.id,
        line_items: [{ price_data: {
          currency: 'usd', product: monthProduct.id, unit_amount: 1100,
        }, quantity: 1 }],
        payment_intent_data: { metadata: metadata('failed_additional_payment_intent') },
        success_url: 'https://example.com/stripe-spike/failure-check-success',
        cancel_url: 'https://example.com/stripe-spike/failure-check-cancel',
        metadata: metadata('failed_additional_checkout'),
      }, { idempotencyKey }),
      `inctagram-${runId}-failed-additional-checkout`,
    );
  }
  const subscriptions = await stripe.subscriptions.list({ customer: customer.id, status: 'all' });
  const schedules = await stripe.subscriptionSchedules.list({ customer: customer.id, limit: 100 });
  process.stdout.write(`${JSON.stringify({
    runId, checkoutSessionId: session.id, checkoutUrl: session.url,
    customerId: customer.id, amount: 1100, currency: 'usd', livemode: session.livemode,
    subscriptionIdsBeforeAttempt: subscriptions.data.map((item) => item.id),
    activeScheduleIdsBeforeAttempt: schedules.data
      .filter((item) => ['not_started', 'active'].includes(item.status)).map((item) => item.id),
  }, null, 2)}\n`);
}

async function inspectFailedAdditionalCheckout(stripe) {
  requireRunId();
  if (!sessionId || !sessionId.startsWith('cs_')) throw new Error('--session-id is required');
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['payment_intent'],
  });
  if (session.livemode !== false || !isOwned(session, 'failed_additional_checkout')) {
    throw new Error('Failed Checkout failed marker/livemode verification');
  }
  const paymentIntentId = objectId(session.payment_intent);
  if (!paymentIntentId) throw new Error('Failed Checkout has no PaymentIntent');
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  const charges = await stripe.charges.list({
    customer: objectId(session.customer), limit: 100,
  });
  const relatedChargeIds = charges.data
    .filter((charge) => objectId(charge.payment_intent) === paymentIntentId)
    .map((charge) => charge.id);
  const subscriptions = await stripe.subscriptions.list({ customer: objectId(session.customer), status: 'all' });
  const schedules = await stripe.subscriptionSchedules.list({ customer: objectId(session.customer), limit: 100 });
  const events = await stripe.events.list({ limit: 100 });
  const relatedEvents = events.data.filter((event) => {
    const eventObject = event.data.object;
    return eventObject?.id === paymentIntentId || eventObject?.id === session.id ||
      relatedChargeIds.includes(eventObject?.id);
  });
  process.stdout.write(`${JSON.stringify({
    runId,
    checkout: {
      id: session.id, status: session.status, paymentStatus: session.payment_status,
      amountTotal: session.amount_total, customerId: objectId(session.customer),
      subscriptionId: objectId(session.subscription),
    },
    paymentIntent: {
      id: paymentIntent.id, status: paymentIntent.status,
      amount: paymentIntent.amount, amountReceived: paymentIntent.amount_received,
    },
    verifiedProviderEvents: relatedEvents.map((event) => ({
      id: event.id, type: event.type, created: event.created, livemode: event.livemode,
    })),
    subscriptionIds: subscriptions.data.map((item) => ({ id: item.id, status: item.status })),
    activeScheduleIds: schedules.data.filter((item) =>
      ['not_started', 'active'].includes(item.status)).map((item) => ({
        id: item.id, status: item.status, startDate: item.phases[0]?.start_date ?? null,
      })),
  }, null, 2)}\n`);
}

async function inventory(stripe) {
  requireRunId();
  await assertTestMode(stripe);
  const sessions = (await stripe.checkout.sessions.list({ limit: 100 })).data.filter((item) => isOwned(item));
  const schedules = (await stripe.subscriptionSchedules.list({ limit: 100 })).data.filter((item) => isOwned(item));
  const subscriptions = (await stripe.subscriptions.list({ status: 'all', limit: 100 })).data.filter((item) => isOwned(item));
  const prices = (await stripe.prices.list({ limit: 100 })).data.filter((item) => isOwned(item));
  const products = (await stripe.products.list({ limit: 100 })).data.filter((item) => isOwned(item));
  const customers = (await stripe.customers.list({ limit: 100 })).data.filter((item) => isOwned(item));
  const paymentIntents = (await stripe.paymentIntents.list({ limit: 100 })).data.filter((item) => isOwned(item));
  const clockName = `${CLOCK_NAME_PREFIX}-${runId}`;
  const clocks = (await stripe.testHelpers.testClocks.list({ limit: 100 })).data.filter(
    (clock) => clock.name === clockName,
  );
  const summarize = (items) => items.map((item) => ({
    id: item.id, status: item.status ?? null, active: item.active ?? null,
    scenario: item.metadata?.spike_scenario ?? null, livemode: item.livemode,
  }));
  process.stdout.write(`${JSON.stringify({ runId, inventory: {
    sessions: summarize(sessions), schedules: summarize(schedules),
    subscriptions: summarize(subscriptions), paymentIntents: summarize(paymentIntents),
    prices: summarize(prices), products: summarize(products), customers: summarize(customers),
    testClocks: clocks.map((clock) => ({ id: clock.id, status: clock.status, livemode: clock.livemode })),
  } }, null, 2)}\n`);
}

async function payLifecycleInvoice(stripe) {
  requireRunId();
  await assertTestMode(stripe);
  const clockName = `${CLOCK_NAME_PREFIX}-${runId}`;
  const clock = (await stripe.testHelpers.testClocks.list({ limit: 100 })).data.find(
    (candidate) => candidate.name === clockName,
  );
  if (!clock) throw new Error('Lifecycle Test Clock was not found');
  const customer = (await stripe.customers.list({ test_clock: clock.id, limit: 100 })).data.find(
    (candidate) => isOwned(candidate, 'lifecycle_customer'),
  );
  if (!customer) throw new Error('Lifecycle Customer was not found');
  const invoices = await stripe.invoices.list({ customer: customer.id, status: 'open', limit: 100 });
  const invoice = invoices.data.find((candidate) => candidate.amount_due === 700);
  if (!invoice) throw new Error('Open lifecycle boundary Invoice was not found');
  const paymentIntentsBefore = await stripe.paymentIntents.list({ customer: customer.id, limit: 100 });
  const payKey = `inctagram-${runId}-pay-${invoice.id}`;
  const paidOnce = await stripe.invoices.pay(invoice.id, {}, { idempotencyKey: payKey });
  const paidTwice = await stripe.invoices.pay(invoice.id, {}, { idempotencyKey: payKey });
  const paymentIntentsAfter = await stripe.paymentIntents.list({ customer: customer.id, limit: 100 });
  const invoicePayments = await stripe.invoicePayments.list({ invoice: invoice.id, limit: 10 });
  const paymentIntentId = objectId(invoicePayments.data[0]?.payment?.payment_intent);
  const paymentIntent = paymentIntentId ? await stripe.paymentIntents.retrieve(paymentIntentId) : null;
  process.stdout.write(`${JSON.stringify({
    runId, clockId: clock.id, customerId: customer.id, invoiceId: invoice.id,
    firstPayStatus: paidOnce.status, secondPayInvoiceId: paidTwice.id,
    attempted: paidTwice.attempted, attemptCount: paidTwice.attempt_count,
    finalizedAt: paidTwice.status_transitions.finalized_at,
    paidAt: paidTwice.status_transitions.paid_at,
    amountPaid: paidTwice.amount_paid,
    paymentIntentId, paymentIntentStatus: paymentIntent?.status ?? null,
    paymentIntentCountBefore: paymentIntentsBefore.data.length,
    paymentIntentCountAfter: paymentIntentsAfter.data.length,
  }, null, 2)}\n`);
}

async function preflight(stripe) {
  await assertTestMode(stripe);
  process.stdout.write(
    `${JSON.stringify({ sdkVersion: '22.3.1', apiVersion: API_VERSION, livemode: false }, null, 2)}\n`,
  );
}

async function cleanup(stripe) {
  requireRunId();
  await assertTestMode(stripe);

  const cleaned = { sessions: [], subscriptions: [], schedules: [], prices: [], products: [], customers: [], testClocks: [] };

  const sessions = await stripe.checkout.sessions.list({ limit: 100 });
  for (const session of sessions.data.filter((candidate) => isOwned(candidate))) {
    if (session.status === 'open') {
      await stripe.checkout.sessions.expire(session.id);
      cleaned.sessions.push(session.id);
    }
  }

  const schedules = await stripe.subscriptionSchedules.list({ limit: 100 });
  for (const schedule of schedules.data.filter((candidate) => isOwned(candidate))) {
    if (schedule.status === 'active' || schedule.status === 'not_started') {
      await stripe.subscriptionSchedules.cancel(schedule.id);
      cleaned.schedules.push(schedule.id);
    }
  }

  const subscriptions = await stripe.subscriptions.list({ status: 'all', limit: 100 });
  for (const subscription of subscriptions.data.filter((candidate) => isOwned(candidate))) {
    if (!['canceled', 'incomplete_expired'].includes(subscription.status)) {
      await stripe.subscriptions.cancel(subscription.id, { invoice_now: false, prorate: false });
      cleaned.subscriptions.push(subscription.id);
    }
  }

  const prices = await stripe.prices.list({ active: true, limit: 100 });
  for (const price of prices.data.filter((candidate) => isOwned(candidate))) {
    await stripe.prices.update(price.id, { active: false });
    cleaned.prices.push(price.id);
  }

  const products = await stripe.products.list({ active: true, limit: 100 });
  for (const product of products.data.filter((candidate) => isOwned(candidate))) {
    await stripe.products.update(product.id, { active: false });
    cleaned.products.push(product.id);
  }

  const customers = await stripe.customers.list({ limit: 100 });
  for (const customer of customers.data.filter((candidate) => isOwned(candidate))) {
    await stripe.customers.del(customer.id);
    cleaned.customers.push(customer.id);
  }

  const clockName = `${CLOCK_NAME_PREFIX}-${runId}`;
  const clocks = await stripe.testHelpers.testClocks.list({ limit: 100 });
  for (const clock of clocks.data.filter((candidate) => candidate.name === clockName)) {
    const deletedClock = await stripe.testHelpers.testClocks.del(clock.id);
    if (deletedClock.deleted) cleaned.testClocks.push(clock.id);
  }

  process.stdout.write(`${JSON.stringify({ runId, cleaned }, null, 2)}\n`);
}

function startWebhookListener(stripe) {
  process.loadEnvFile(ENV_PATH);
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret || !webhookSecret.startsWith(WEBHOOK_SECRET_PREFIX)) {
    throw new Error('STRIPE_WEBHOOK_SECRET is missing or invalid');
  }

  const server = http.createServer((request, response) => {
    if (request.method !== 'POST' || request.url !== WEBHOOK_PATH) {
      response.writeHead(404).end();
      return;
    }

    const chunks = [];
    let bodyLength = 0;
    request.on('data', (chunk) => {
      bodyLength += chunk.length;
      if (bodyLength > MAX_BODY_BYTES) request.destroy();
      else chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        const rawBody = Buffer.concat(chunks);
        const signature = request.headers['stripe-signature'];
        const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
        const object = event.data.object;
        process.stdout.write(
          `${JSON.stringify({
            eventId: event.id,
            type: event.type,
            created: event.created,
            objectId: object.id ?? null,
            objectType: object.object ?? null,
            livemode: event.livemode,
            verified: true,
          })}\n`,
        );
        response.writeHead(200).end('ok');
      } catch {
        process.stdout.write(`${JSON.stringify({ verified: false })}\n`);
        response.writeHead(400).end('invalid signature');
      }
    });
  });

  server.listen(WEBHOOK_PORT, '127.0.0.1', () => {
    process.stdout.write(`LISTENING http://localhost:${WEBHOOK_PORT}${WEBHOOK_PATH}\n`);
  });
}

async function main() {
  if (!mode) {
    throw new Error(
      '--mode is required: preflight, listen, prepare-initial, inspect-initial, prepare-additional, inspect-additional, configure-real-alignment, clock-equivalent, finish-clock-equivalent, auto-renew-lifecycle, pay-lifecycle-invoice, prepare-failed-additional, inspect-failed-additional, inventory, cleanup',
    );
  }
  const stripe = loadStripe();

  if (mode === 'preflight') return preflight(stripe);
  if (mode === 'listen') return startWebhookListener(stripe);
  if (mode === 'prepare-initial') return prepareInitialCheckout(stripe);
  if (mode === 'inspect-initial') return inspectInitialCheckout(stripe);
  if (mode === 'prepare-additional') return prepareAdditionalCheckout(stripe);
  if (mode === 'inspect-additional') return inspectAdditionalCheckout(stripe);
  if (mode === 'configure-real-alignment') return configureRealAlignment(stripe);
  if (mode === 'clock-equivalent') return runClockEquivalent(stripe);
  if (mode === 'finish-clock-equivalent') return finishClockEquivalent(stripe);
  if (mode === 'auto-renew-lifecycle') return runAutoRenewLifecycle(stripe);
  if (mode === 'pay-lifecycle-invoice') return payLifecycleInvoice(stripe);
  if (mode === 'prepare-failed-additional') return prepareFailedAdditionalCheckout(stripe);
  if (mode === 'inspect-failed-additional') return inspectFailedAdditionalCheckout(stripe);
  if (mode === 'inventory') return inventory(stripe);
  if (mode === 'cleanup') return cleanup(stripe);
  throw new Error(`Unsupported mode: ${mode}`);
}

main().catch((error) => fail(`Stripe spike failed: ${error.message}`));
