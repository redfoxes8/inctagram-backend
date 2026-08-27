import { AmqpConnection, Nack } from '@golevelup/nestjs-rabbitmq';

import { PrismaService } from '../../src/core/prisma/prisma.service';
import type { PaymentRabbitConsumer as PaymentRabbitConsumerType } from '../../src/modules/users/infrastructure/payment.rabbit.consumer';

describe('PaymentRabbitConsumer bounded retry', () => {
  let PaymentRabbitConsumer: typeof PaymentRabbitConsumerType;
  let retryRoutingKey: string;
  let dlqRoutingKey: string;
  const event = {
    eventId: '6e660aba-669b-4d55-b43b-6ccbfba6e1dd',
    version: 1,
    eventType: 'subscription.activated.v1',
    occurredAt: '2026-08-27T12:00:00.000Z',
    aggregateType: 'SUBSCRIPTION',
    aggregateId: '22222222-2222-4222-8222-222222222222',
    routingKey: 'subscription.activated',
    payload: {
      userId: '11111111-1111-4111-8111-111111111111',
      subscriptionId: '22222222-2222-4222-8222-222222222222',
      subscriptionSequence: 1,
      startsAt: '2026-08-27T12:00:00.000Z',
      endsAt: '2026-09-03T12:00:00.000Z',
      productId: 'aecb2328-a369-4128-a59a-e4d2f92b155c',
    },
  };

  const message = (
    retryCount?: number,
  ): { properties: { headers: Record<string, number>; messageId: string } } => ({
    properties: {
      headers: retryCount === undefined ? {} : { 'x-payment-entitlement-retry-count': retryCount },
      messageId: event.eventId,
    },
  });

  beforeAll(() => {
    process.env.PAYMENT_ACCOUNT_QUEUE_NAME = 'gateway-payment-account-test';
    const consumerModule = jest.requireActual<
      typeof import('../../src/modules/users/infrastructure/payment.rabbit.consumer')
    >('../../src/modules/users/infrastructure/payment.rabbit.consumer');
    PaymentRabbitConsumer = consumerModule.PaymentRabbitConsumer;
    retryRoutingKey = consumerModule.PAYMENT_ENTITLEMENT_RETRY_DELAY_ROUTING_KEY;
    dlqRoutingKey = consumerModule.PAYMENT_ENTITLEMENT_DLQ_ROUTING_KEY;
  });

  const consumer = (
    publish: jest.Mock,
    transaction: jest.Mock = jest.fn().mockRejectedValue(new Error('transaction failed')),
  ): PaymentRabbitConsumerType => {
    const prisma = {
      $transaction: transaction,
    };
    return new PaymentRabbitConsumer(
      prisma as unknown as PrismaService,
      { publish } as unknown as AmqpConnection,
    );
  };

  it('acknowledges only after scheduling a persistent five-minute retry', async () => {
    const publish = jest.fn().mockResolvedValue(true);

    const result = await consumer(publish).handlePaymentEntitlementEvent(event, message());

    expect(result).toBeUndefined();
    expect(publish).toHaveBeenCalledWith(
      'common_exchange',
      retryRoutingKey,
      event,
      expect.objectContaining({
        persistent: true,
        mandatory: true,
        messageId: event.eventId,
        expiration: 300_000,
        headers: { 'x-payment-entitlement-retry-count': 1 },
      }),
    );
  });

  it('moves the third failed attempt to the durable DLQ route', async () => {
    const publish = jest.fn().mockResolvedValue(true);

    const result = await consumer(publish).handlePaymentEntitlementEvent(event, message(2));

    expect(result).toBeUndefined();
    expect(publish).toHaveBeenCalledWith(
      'common_exchange',
      dlqRoutingKey,
      event,
      expect.objectContaining({
        persistent: true,
        headers: { 'x-payment-entitlement-retry-count': 3 },
      }),
    );
  });

  it('requeues the original message when retry publication is unavailable', async () => {
    jest.useFakeTimers();
    const publish = jest.fn().mockRejectedValue(new Error('publish failed'));

    const handling = consumer(publish).handlePaymentEntitlementEvent(event, message());
    await jest.advanceTimersByTimeAsync(300_000);
    const result = await handling;

    expect(result).toBeInstanceOf(Nack);
    expect((result as Nack).requeue).toBe(true);
    jest.useRealTimers();
  });

  it('does not acknowledge when the broker does not confirm retry publication', async () => {
    jest.useFakeTimers();
    const publish = jest.fn().mockResolvedValue(false);

    const handling = consumer(publish).handlePaymentEntitlementEvent(event, message());
    await jest.advanceTimersByTimeAsync(300_000);
    const result = await handling;

    expect(result).toBeInstanceOf(Nack);
    expect((result as Nack).requeue).toBe(true);
    jest.useRealTimers();
  });

  it('does not acknowledge success before the database transaction commits', async () => {
    const publish = jest.fn();
    let commit: (() => void) | undefined;
    const transaction = jest.fn().mockReturnValue(
      new Promise<void>((resolve) => {
        commit = resolve;
      }),
    );

    let settled = false;
    const handling = consumer(publish, transaction)
      .handlePaymentEntitlementEvent(event, message())
      .then((result) => {
        settled = true;
        return result;
      });
    await Promise.resolve();

    expect(settled).toBe(false);
    commit?.();
    await expect(handling).resolves.toBeUndefined();
    expect(publish).not.toHaveBeenCalled();
  });

  it('keeps duplicate Inbox events idempotent without retry publication', async () => {
    const publish = jest.fn();
    const transaction = jest.fn().mockImplementation((work) =>
      work({
        paymentEntitlementInbox: {
          findUnique: jest.fn().mockResolvedValue({ eventId: event.eventId }),
        },
      }),
    );

    const result = await consumer(publish, transaction).handlePaymentEntitlementEvent(
      event,
      message(),
    );

    expect(result).toBeUndefined();
    expect(publish).not.toHaveBeenCalled();
  });
});
