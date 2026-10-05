import { Logger } from '@nestjs/common';
import amqp from 'amqplib';

import { PaymentConfig } from '../../src/core/payment.config';
import {
  ClaimedPaymentOutboxEvent,
  IPaymentOutboxPublisher,
  IPaymentOutboxRelayRepository,
} from '../../src/modules/payment/application/ports/payment-outbox-relay.port';
import { PaymentOutboxPublisher } from '../../src/modules/payment/infrastructure/messaging/payment-outbox.publisher';
import { PaymentOutboxRelayService } from '../../src/modules/payment/infrastructure/messaging/payment-outbox-relay.service';

jest.mock('amqplib', () => ({
  __esModule: true,
  default: { connect: jest.fn() },
}));

const EVENT: ClaimedPaymentOutboxEvent = {
  id: '11111111-1111-4111-8111-111111111111',
  aggregateType: 'SUBSCRIPTION',
  aggregateId: '22222222-2222-4222-8222-222222222222',
  eventType: 'payment.notification.requested.v1',
  eventVersion: 1,
  routingKey: 'payment.notification.requested',
  payload: {},
  attempts: 1,
  occurredAt: new Date('2026-10-01T00:00:00.000Z'),
};

type ChannelListener = () => void;

function channel(input: { closeListener?: ChannelListener } = {}) {
  const listeners = new Map<string, Set<ChannelListener>>();
  if (input.closeListener) listeners.set('close', new Set([input.closeListener]));
  return {
    assertExchange: jest.fn().mockResolvedValue(undefined),
    publish: jest
      .fn()
      .mockImplementation(
        (
          _exchange: string,
          _routingKey: string,
          _content: Buffer,
          _options: object,
          callback: (error: Error | null) => void,
        ) => {
          callback(null);
          return true;
        },
      ),
    on: jest.fn().mockImplementation((event: string, listener: ChannelListener) => {
      const eventListeners = listeners.get(event) ?? new Set<ChannelListener>();
      eventListeners.add(listener);
      listeners.set(event, eventListeners);
    }),
    off: jest.fn().mockImplementation((event: string, listener: ChannelListener) => {
      const eventListeners = listeners.get(event);
      eventListeners?.delete(listener);
      if (eventListeners?.size === 0) listeners.delete(event);
    }),
    close: jest.fn().mockResolvedValue(undefined),
    emitClose: (): void => listeners.get('close')?.forEach((listener) => listener()),
  };
}

describe('Payment outbox relay diagnostics', () => {
  const config = {
    outboxRelayEnabled: true,
    outboxRelayCron: '* * * * * *',
    outboxRelayLockTimeoutSeconds: 60,
    outboxRelayBatchSize: 20,
    outboxRelayMaxAttempts: 3,
    outboxRelayBackoffSeconds: 10,
    rabbitUrl: 'amqp://redacted',
  } as PaymentConfig;

  afterEach(() => jest.restoreAllMocks());

  it('logs a safe AMQP code and schedules the failed event for retry', async () => {
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const publisher = {
      publish: jest
        .fn()
        .mockRejectedValue(Object.assign(new Error('connect failed'), { code: 'ECONNREFUSED' })),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as IPaymentOutboxPublisher;
    const markFailedOrRetry = jest.fn().mockResolvedValue(true);
    const repository = {
      markFailedOrRetry,
    } as unknown as IPaymentOutboxRelayRepository;
    const service = new PaymentOutboxRelayService(config, repository, publisher);

    await (
      service as unknown as { publishOne(event: ClaimedPaymentOutboxEvent): Promise<void> }
    ).publishOne(EVENT);

    expect(warning).toHaveBeenCalledWith({
      event: 'payment.outbox.publish.failed',
      eventType: EVENT.eventType,
      routingKey: EVENT.routingKey,
      errorCode: 'ECONNREFUSED',
    });
    expect(markFailedOrRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        id: EVENT.id,
        maxAttempts: 3,
        baseBackoffSeconds: 10,
        safeError: 'OUTBOX_PUBLISH_FAILED',
      }),
    );
  });

  it('creates a fresh confirm channel after the cached channel closes', async () => {
    const firstChannel = channel();
    const secondChannel = channel();
    const firstConnection = {
      createConfirmChannel: jest.fn().mockResolvedValue(firstChannel),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const secondConnection = {
      createConfirmChannel: jest.fn().mockResolvedValue(secondChannel),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const connect = amqp.connect as jest.Mock;
    connect.mockResolvedValueOnce(firstConnection).mockResolvedValueOnce(secondConnection);
    const publisher = new PaymentOutboxPublisher(config);

    await publisher.publish(EVENT);
    firstChannel.emitClose();
    await expect(publisher.publish(EVENT)).resolves.toBeUndefined();

    expect(connect).toHaveBeenCalledTimes(2);
    expect(secondConnection.createConfirmChannel).toHaveBeenCalledTimes(1);
  });
});
