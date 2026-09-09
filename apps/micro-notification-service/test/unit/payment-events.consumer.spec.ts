import { MessageHandlerErrorBehavior, Nack, RABBIT_HANDLER } from '@golevelup/nestjs-rabbitmq';

import { NotificationConfig } from '../../src/core/notification.config';
import { NotificationPrismaService } from '../../src/core/prisma/prisma.service';
import {
  PaymentEventsConsumer,
  PAYMENT_NOTIFICATION_EMAIL_CHANNEL,
  PAYMENT_NOTIFICATION_EMAIL_PREFETCH_COUNT,
} from '../../src/modules/notifications/api/rabbit/payment-events.consumer';
import { IMailAdapter } from '../../src/application/interfaces/mail-adapter.interface';
import { NotificationRecipientContextPort } from '../../src/modules/notifications/application/ports/notification-recipient-context.port';

const EVENT = {
  eventId: '11111111-1111-4111-8111-111111111111',
  version: 1,
  eventType: 'payment.succeeded.v1',
  occurredAt: '2026-09-09T10:00:00.000Z',
  aggregateType: 'PAYMENT_TRANSACTION',
  aggregateId: '22222222-2222-4222-8222-222222222222',
  routingKey: 'payment.succeeded',
  payload: {
    userId: '33333333-3333-4333-8333-333333333333',
    subscriptionId: null,
  },
};

type RabbitHandlerMetadata = Readonly<{
  queueOptions: Readonly<{ channel?: string }>;
  errorBehavior: MessageHandlerErrorBehavior;
}>;

function createConsumer(input: Readonly<{ transaction: jest.Mock }>): {
  consumer: PaymentEventsConsumer;
  recipientContext: { getNotificationRecipientContext: jest.Mock };
  mailAdapter: { sendEmail: jest.Mock };
} {
  const recipientContext = {
    getNotificationRecipientContext: jest.fn().mockResolvedValue({
      email: 'recipient@example.test',
      userName: 'recipient',
    }),
  };
  const mailAdapter = { sendEmail: jest.fn().mockResolvedValue(undefined) };
  const consumer = new PaymentEventsConsumer(
    {
      $transaction: input.transaction,
      notificationDelivery: { update: jest.fn().mockResolvedValue(undefined) },
    } as unknown as NotificationPrismaService,
    { paymentNotificationMaxAttempts: 3 } as NotificationConfig,
    recipientContext as unknown as NotificationRecipientContextPort,
    mailAdapter as unknown as IMailAdapter,
  );
  return { consumer, recipientContext, mailAdapter };
}

describe('PaymentEventsConsumer P2028 protection', () => {
  it('dead-letters a P2028 claim without retrying the transaction or calling recipient/email flows', async () => {
    const transaction = jest.fn().mockRejectedValue({ code: 'P2028' });
    const { consumer, recipientContext, mailAdapter } = createConsumer({ transaction });

    const result = await consumer.handlePaymentEvent(EVENT);

    expect(result).toBeInstanceOf(Nack);
    expect((result as Nack).requeue).toBe(false);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(recipientContext.getNotificationRecipientContext).not.toHaveBeenCalled();
    expect(mailAdapter.sendEmail).not.toHaveBeenCalled();
  });

  it('uses the named one-message channel, nacks unexpected errors without requeue, and retains successful handling', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      PaymentEventsConsumer.prototype,
      'handlePaymentEvent',
    );
    const handler: unknown = descriptor?.value;
    if (typeof handler !== 'function') throw new Error('Handler metadata missing');
    const metadata = Reflect.getMetadata(RABBIT_HANDLER, handler) as RabbitHandlerMetadata;
    expect(metadata.queueOptions.channel).toBe(PAYMENT_NOTIFICATION_EMAIL_CHANNEL);
    expect(PAYMENT_NOTIFICATION_EMAIL_PREFETCH_COUNT).toBe(1);
    expect(metadata.errorBehavior).toBe(MessageHandlerErrorBehavior.NACK);

    const unexpectedTransaction = jest.fn().mockRejectedValue(new Error('unexpected'));
    const unexpected = createConsumer({ transaction: unexpectedTransaction });
    await expect(unexpected.consumer.handlePaymentEvent(EVENT)).rejects.toThrow('unexpected');
    expect(unexpectedTransaction).toHaveBeenCalledTimes(1);

    const transaction = jest.fn().mockImplementation((callback) =>
      callback({
        notificationDelivery: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockResolvedValue(undefined),
        },
      }),
    );
    const { consumer, recipientContext, mailAdapter } = createConsumer({ transaction });
    await expect(consumer.handlePaymentEvent(EVENT)).resolves.toBeUndefined();
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(recipientContext.getNotificationRecipientContext).toHaveBeenCalledTimes(1);
    expect(mailAdapter.sendEmail).toHaveBeenCalledTimes(1);
  });
});
