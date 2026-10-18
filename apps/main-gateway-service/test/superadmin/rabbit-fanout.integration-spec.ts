import { Test } from '@nestjs/testing';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { NotificationLiveEventConsumer } from '../../src/modules/notifications/infrastructure/notification-live-event.consumer';
import { NotificationLiveEventPublisher } from '../../src/modules/notifications/infrastructure/notification-live-event.publisher';
import { NotificationRealtimePublisher } from '../../src/modules/notifications/realtime/notification-realtime.publisher';
import { IsolatedRabbit } from './isolated-rabbit';

describe('Gateway fan-out prerequisite: actual isolated RabbitMQ', () => {
  jest.setTimeout(120000);
  it('registers an independent server-named queue per Gateway and delivers the same live event to both', async () => {
    const rabbit = new IsolatedRabbit();
    const instances: { close: () => Promise<void> }[] = [];
    try {
      await rabbit.start();
      const delivered: Promise<unknown>[] = [];
      for (let index = 0; index < 2; index++) {
        const connection = await rabbit.connection();
        let receive!: (value: unknown) => void;
        delivered.push(
          new Promise((resolve) => {
            receive = resolve;
          }),
        );
        const module = await Test.createTestingModule({
          providers: [
            NotificationLiveEventConsumer,
            { provide: AmqpConnection, useValue: connection },
            {
              provide: NotificationRealtimePublisher,
              useValue: {
                publishUnseenCount: (userId: string, payload: object): void =>
                  receive({ userId, payload }),
              },
            },
          ],
        }).compile();
        const gateway = module.createNestApplication();
        await gateway.init();
        instances.push(gateway);
      }
      const queues = rabbit
        .queues()
        .filter((queue) => queue.name.startsWith('amq.gen-') && queue.consumers === 1);
      expect(queues).toHaveLength(2);
      expect(new Set(queues.map((queue) => queue.name)).size).toBe(2);
      const publisher = new NotificationLiveEventPublisher(await rabbit.connection());
      const payload = {
        userId: '10000000-0000-4000-8000-000000000001',
        unseenCount: 4,
        seenThrough: '2026-10-18T12:00:00.000Z',
      };
      await publisher.publishUnseenCountChanged(payload);
      expect(await Promise.all(delivered)).toEqual(
        [0, 1].map(() => ({
          userId: payload.userId,
          payload: { unseenCount: 4, seenThrough: payload.seenThrough },
        })),
      );
    } finally {
      await Promise.all(instances.map((instance) => instance.close()));
      await rabbit.stop();
    }
  });
});
