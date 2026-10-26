import { Test, type TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { IsolatedRabbit } from './isolated-rabbit';
import { GatewayConfig } from '../../src/core/gateway.config';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { SuperadminPostsDeliveryModule } from '../../src/modules/superadmin/superadmin-posts-delivery.module';
import { SuperadminPostPublishedReader } from '../../src/modules/superadmin/domain/superadmin-post-published-reader.port';
import {
  PaymentPageProfiles,
  type PaymentPageUserProfile,
} from '../../src/modules/superadmin/domain/payment-page-profiles.port';
import { PostPublishedDelivery } from '../../src/modules/superadmin/application/post-published-delivery';
import { SuperadminPostSubscription } from '../../src/modules/superadmin/api/superadmin-post-subscription';
import type { SuperadminWsContext } from '../../src/modules/superadmin/api/superadmin-context';
import { PostPublishedFanoutConsumer } from '../../src/modules/superadmin/infrastructure/post-published-fanout.consumer';
import {
  PaymentProfileConfirmPublisher,
  type ProfileConsumerChannel,
} from '../../../../libs/common/src/messaging/payment-profile-confirm-publisher';
import {
  POST_PUBLISHED_ROUTING_KEY,
  type PostPublishedV1,
} from '../../../../libs/contracts/src/events/post-published-v1.event';
import type {
  SuperadminPostPublishedView,
  SuperadminPostSubscriptionEvent,
} from '../../../../libs/common/types/superadmin-posts';

type TestReader = {
  checkProjectionReady: jest.Mock<
    ReturnType<SuperadminPostPublishedReader['checkProjectionReady']>,
    Parameters<SuperadminPostPublishedReader['checkProjectionReady']>
  >;
  readPublishedView: jest.Mock<
    ReturnType<SuperadminPostPublishedReader['readPublishedView']>,
    Parameters<SuperadminPostPublishedReader['readPublishedView']>
  >;
};
type TestProfiles = { findProfiles: jest.Mock<Promise<PaymentPageUserProfile[]>, [string[]]> };

function gate(): { promise: Promise<void>; open: () => void } {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}
async function until(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Disposable broker/test callback deadline');
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
}
function event(): PostPublishedV1 {
  return {
    schemaVersion: 1,
    eventId: randomUUID(),
    postId: randomUUID(),
    ownerId: randomUUID(),
    publishedAt: '2026-10-26T12:00:00.000Z',
  };
}
function found(postId: string): SuperadminPostPublishedView {
  return {
    outcome: 'FOUND',
    post: {
      postId,
      userId: randomUUID(),
      username: 'Projection_CASE',
      description: '',
      publishedAt: '2026-10-26T12:00:00.000Z',
      images: [{ fileId: randomUUID(), order: 0, url: null }],
      userSnapshot: null,
    },
  };
}
function access(): { context: SuperadminWsContext; closed: boolean; revoked: boolean } {
  const cleanups = new Set<() => void>();
  const client = { closed: false, revoked: false, context: {} as SuperadminWsContext };
  const close = (): void => {
    client.closed = true;
    for (const cleanup of cleanups) cleanup();
    cleanups.clear();
  };
  client.context = {
    transport: 'ws',
    request: {} as IncomingMessage,
    principal: null,
    lifecycle: {
      assertAuthorized: jest.fn(() => {
        if (client.revoked || client.closed) {
          close();
          return Promise.reject(
            new GraphQLError('Authentication required', {
              extensions: { code: 'UNAUTHENTICATED' },
            }),
          );
        }
        return Promise.resolve({
          role: 'SUPERADMIN' as const,
          sessionId: 'isolated-delivery-session',
        });
      }),
      onClose: (cleanup) => {
        if (client.closed) cleanup();
        else cleanups.add(cleanup);
        return (): void => {
          cleanups.delete(cleanup);
        };
      },
      unavailable: close,
    },
  };
  return client;
}

describe('D6a Gateway published delivery, real disposable RabbitMQ', () => {
  jest.setTimeout(120000);
  const rabbit = new IsolatedRabbit();
  let publisher: PaymentProfileConfirmPublisher;
  const modules: TestingModule[] = [];
  const iterators: AsyncIterableIterator<SuperadminPostSubscriptionEvent>[] = [];

  async function instance(input: { unavailable?: boolean } = {}): Promise<{
    delivery: PostPublishedDelivery;
    factory: SuperadminPostSubscription;
    consumer: PostPublishedFanoutConsumer;
    reader: TestReader;
    profiles: TestProfiles;
    ack: jest.SpyInstance;
    handle: jest.SpyInstance;
  }> {
    const reader: TestReader = {
      checkProjectionReady: jest
        .fn<Promise<void>, Parameters<SuperadminPostPublishedReader['checkProjectionReady']>>()
        .mockResolvedValue(undefined),
      readPublishedView: jest.fn((request) => Promise.resolve(found(request.postId))),
    };
    const profiles: TestProfiles = {
      findProfiles: jest.fn<Promise<PaymentPageUserProfile[]>, [string[]]>().mockResolvedValue([]),
    };
    const builder = Test.createTestingModule({ imports: [SuperadminPostsDeliveryModule] })
      .overrideProvider(GatewayConfig)
      .useValue({ rabbitmqUrl: rabbit.url })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(PaymentPageProfiles)
      .useValue(profiles);
    if (!input.unavailable)
      builder.overrideProvider(SuperadminPostPublishedReader).useValue(reader);
    const module = await builder.compile();
    modules.push(module);
    await module.init();
    const consumer = module.get(PostPublishedFanoutConsumer);
    const channel = Reflect.get(consumer, 'channel') as ProfileConsumerChannel;
    const delivery = module.get(PostPublishedDelivery);
    return {
      delivery,
      consumer,
      factory: module.get(SuperadminPostSubscription),
      reader,
      profiles,
      ack: jest.spyOn(channel, 'ack'),
      handle: jest.spyOn(delivery, 'handle'),
    };
  }
  async function subscribe(input: {
    gateway: Awaited<ReturnType<typeof instance>>;
    client?: ReturnType<typeof access>;
    search?: string;
  }): Promise<AsyncIterableIterator<SuperadminPostSubscriptionEvent>> {
    const iterator = await input.gateway.factory.create({
      context: (input.client ?? access()).context,
      searchUsername: input.search,
    });
    iterators.push(iterator);
    expect(await iterator.next()).toEqual({ done: false, value: { kind: 'READY', post: null } });
    return iterator;
  }
  async function publish(value: PostPublishedV1): Promise<void> {
    await publisher.publish({
      routingKey: POST_PUBLISHED_ROUTING_KEY,
      messageId: value.eventId,
      content: Buffer.from(JSON.stringify(value)),
    });
  }
  function quickRetries(): { delays: number[] } {
    const original = global.setTimeout;
    const delays: number[] = [];
    jest.spyOn(global, 'setTimeout').mockImplementation(((
      callback: (...args: unknown[]) => void,
      delay?: number,
      ...args: unknown[]
    ) => {
      if (delay === 1000 || delay === 2000 || delay === 4000) {
        delays.push(delay);
        return original(callback, 0, ...args);
      }
      return original(callback, delay, ...args);
    }) as typeof setTimeout);
    return { delays };
  }
  beforeAll(async () => {
    await rabbit.start();
    await rabbit.connection();
    publisher = new PaymentProfileConfirmPublisher(rabbit.url);
  });
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });
  afterEach(async () => {
    await Promise.all(
      iterators.splice(0).map((iterator) => iterator.return?.() ?? Promise.resolve()),
    );
    await Promise.all(modules.splice(0).map((module) => module.close()));
    jest.restoreAllMocks();
  });
  afterAll(async () => {
    await publisher?.close();
    await rabbit.stop();
  });

  it('fans out to two independent queues; registration joins in-flight read, READY first, duplicate acks wait for shared processing', async () => {
    const first = await instance();
    const second = await instance();
    expect(
      rabbit.queues().filter((queue) => queue.name.startsWith('amq.gen-') && queue.consumers === 1),
    ).toHaveLength(2);
    const stream = await subscribe({ gateway: first, search: 'CASE_%' });
    const remote = await subscribe({ gateway: second });
    const entered = gate();
    const release = gate();
    jest.spyOn(first.reader, 'readPublishedView').mockImplementation(async (request) => {
      entered.open();
      await release.promise;
      return found(request.postId);
    });
    const value = event();
    await publish(value);
    await entered.promise;
    const late = await subscribe({ gateway: first, search: ' CASE_% ' });
    const newFilter = await subscribe({ gateway: first, search: 'other-filter' });
    await publish(value);
    await until(() => first.handle.mock.calls.length === 2);
    expect(first.handle.mock.results[0].value).toBe(first.handle.mock.results[1].value);
    expect(first.ack).not.toHaveBeenCalled();
    release.open();
    for (const iterator of [stream, late, newFilter, remote])
      expect(await iterator.next()).toMatchObject({
        value: {
          kind: 'POST_PUBLISHED',
          post: { postId: value.postId, username: 'Projection_CASE' },
        },
      });
    await until(() => first.ack.mock.calls.length === 2);
    expect(first.reader.readPublishedView).toHaveBeenCalledTimes(2);
    expect(first.reader.readPublishedView).toHaveBeenCalledWith(
      expect.objectContaining({ searchUsername: 'CASE_%' }),
    );
    await publish(value);
    await until(() => first.ack.mock.calls.length === 3);
    expect(first.reader.readPublishedView).toHaveBeenCalledTimes(2);
  });

  it('keeps unavailable adapter/readiness fail-closed, avoids reads/dedupe without listeners, bounds filter reads at four', async () => {
    const unavailable = await instance({ unavailable: true });
    await expect(unavailable.factory.create({ context: access().context })).rejects.toMatchObject({
      code: 503,
    });
    const gateway = await instance();
    const value = event();
    expect(await gateway.delivery.handle(value)).toBe('ignored');
    expect(gateway.reader.readPublishedView).not.toHaveBeenCalled();
    const streams = await Promise.all(
      Array.from({ length: 6 }, (_, index) => subscribe({ gateway, search: `Filter${index}` })),
    );
    let active = 0;
    let maximum = 0;
    const entered = gate();
    const release = gate();
    jest.spyOn(gateway.reader, 'readPublishedView').mockImplementation(async (request) => {
      active++;
      maximum = Math.max(maximum, active);
      if (active === 4) entered.open();
      await release.promise;
      active--;
      return found(request.postId);
    });
    const processing = gateway.delivery.handle(value);
    await entered.promise;
    expect(maximum).toBe(4);
    release.open();
    expect(await processing).toBe('completed');
    for (const stream of streams) expect((await stream.next()).value.kind).toBe('POST_PUBLISHED');
    expect(gateway.reader.readPublishedView).toHaveBeenCalledTimes(6);
    expect(maximum).toBeLessThanOrEqual(4);
    const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 600001);
    try {
      expect(await gateway.delivery.handle(value)).toBe('completed');
    } finally {
      clock.mockRestore();
    }
    expect(gateway.reader.readPublishedView).toHaveBeenCalledTimes(12);
  });

  it('recovers a transient read, binds missing confirmation to actual Post author, and lets SQL decide search', async () => {
    const gateway = await instance();
    const unfiltered = await subscribe({ gateway });
    const filtered = await subscribe({ gateway, search: 'Case_%' });
    const author = 'actual-source-author-text';
    const timing = quickRetries();
    const read = jest.spyOn(gateway.reader, 'readPublishedView');
    read.mockRejectedValueOnce(new Error('transient read'));
    read.mockImplementation((request) => {
      if (!request.authorMissingConfirmed)
        return Promise.resolve({
          outcome: 'UNRESOLVED_AUTHOR',
          userId: author,
          postId: request.postId,
        });
      expect(request.authorUserId).toBe(author);
      if (request.searchUsername) return Promise.resolve({ outcome: 'FILTERED' });
      const result = found(request.postId);
      if (result.outcome === 'FOUND')
        return Promise.resolve({
          ...result,
          post: { ...result.post, userId: author, username: null },
        });
      return Promise.resolve(result);
    });
    const value = event();
    expect(value.ownerId).not.toBe(author);
    await publish(value);
    expect(await unfiltered.next()).toMatchObject({
      value: { kind: 'POST_PUBLISHED', post: { username: null, userId: author } },
    });
    await until(() => gateway.ack.mock.calls.length === 1);
    expect(timing.delays).toEqual([1000]);
    expect(gateway.profiles.findProfiles).toHaveBeenCalledWith([author]);
    expect(gateway.profiles.findProfiles).toHaveBeenCalledTimes(2); // One shared lookup per attempt, not per filter/client.
    expect(await filtered.return?.()).toMatchObject({ done: true });
  });

  it('distinguishes existing/deleted/profileless users and storage errors from missing: exactly four attempts and failed-refetch ack/cache', async () => {
    const gateway = await instance();
    const author = 'actual-author';
    const timing = quickRetries();
    const read = jest.spyOn(gateway.reader, 'readPublishedView').mockImplementation((request) =>
      Promise.resolve({
        outcome: 'UNRESOLVED_AUTHOR',
        postId: request.postId,
        userId: author,
      }),
    );
    const lookup = jest.spyOn(gateway.profiles, 'findProfiles');
    for (const state of ['live', 'deleted', 'profileless', 'storage'] as const) {
      const client = access();
      const stream = await subscribe({ gateway, client });
      lookup.mockImplementation(() => {
        if (state === 'storage') return Promise.reject(new Error('storage failure'));
        return Promise.resolve([
          {
            userId: author,
            deletedAt: state === 'deleted' ? new Date() : null,
            profileExists: state !== 'profileless',
            avatarUrl: null,
          },
        ]);
      });
      const before = read.mock.calls.length;
      const delayStart = timing.delays.length;
      const ackBefore = gateway.ack.mock.calls.length;
      const value = event();
      await publish(value);
      expect(await stream.next()).toMatchObject({ done: true });
      await until(() => gateway.ack.mock.calls.length === ackBefore + 1);
      expect(client.closed).toBe(true);
      expect(read.mock.calls.length - before).toBe(4);
      expect(timing.delays.slice(delayStart)).toEqual([1000, 2000, 4000]);
      expect(await gateway.delivery.handle(value)).toBe('failedRefetch');
      expect(read.mock.calls.length - before).toBe(4);
    }
  });

  it('isolates slow/revoked subscriptions; successful no-ops and invalid messages do not invent posts', async () => {
    const gateway = await instance();
    const slowClient = access();
    const slow = await subscribe({ gateway, client: slowClient });
    const fast = await subscribe({ gateway });
    for (let index = 0; index < 101; index++) {
      const receive = fast.next();
      expect(await gateway.delivery.handle(event())).toBe('completed');
      expect((await receive).value.kind).toBe('POST_PUBLISHED');
    }
    expect(await slow.next()).toMatchObject({ done: true });
    expect(slowClient.closed).toBe(true);
    const revokedClient = access();
    const revoked = await subscribe({ gateway, client: revokedClient });
    revokedClient.revoked = true;
    const received = fast.next();
    await gateway.delivery.handle(event());
    expect((await received).value.kind).toBe('POST_PUBLISHED');
    expect(await revoked.next()).toMatchObject({ done: true });
    const queuedClient = access();
    const queued = await subscribe({ gateway, client: queuedClient });
    const live = fast.next();
    await gateway.delivery.handle(event());
    await live;
    queuedClient.revoked = true;
    expect(await queued.next()).toMatchObject({ done: true }); // D5 checks even already-enqueued data.
    const failingClient = access();
    const failing = await subscribe({ gateway, client: failingClient });
    jest
      .spyOn(failingClient.context.lifecycle, 'assertAuthorized')
      .mockRejectedValueOnce(new Error('transient session storage'));
    const timing = quickRetries();
    const partial = event();
    expect(await gateway.delivery.handle(partial)).toBe('completed');
    // Fast was enqueued before another client's server failure. Retry must run, not cache partial success.
    for (let copy = 0; copy < 2; copy++)
      expect(await fast.next()).toMatchObject({ value: { post: { postId: partial.postId } } });
    expect(timing.delays).toEqual([1000]);
    expect(failingClient.closed).toBe(true);
    expect(await failing.next()).toMatchObject({ done: true });
    jest.spyOn(gateway.reader, 'readPublishedView').mockResolvedValue({ outcome: 'NOT_FOUND' });
    expect(await gateway.delivery.handle(event())).toBe('completed');
    const reads = jest.mocked(gateway.reader.readPublishedView).mock.calls.length;
    await publisher.publish({
      routingKey: POST_PUBLISHED_ROUTING_KEY,
      messageId: randomUUID(),
      content: Buffer.from('{"invalid":true}'),
    });
    await until(() => gateway.ack.mock.calls.length === 1);
    expect(jest.mocked(gateway.reader.readPublishedView).mock.calls.length).toBe(reads);
  });

  it('invalidates registration/readiness on real channel loss; reconnect binds a new queue and cleanup prevents resurrection', async () => {
    const gateway = await instance();
    const client = access();
    const stream = await subscribe({ gateway, client });
    const previous = rabbit.queues().find((queue) => queue.name.startsWith('amq.gen-'))?.name;
    const entered = gate();
    const release = gate();
    jest.spyOn(gateway.reader, 'checkProjectionReady').mockImplementationOnce(async () => {
      entered.open();
      await release.promise;
    });
    const registering = gateway.factory.create({ context: access().context });
    const rejected = expect(registering).rejects.toMatchObject({ code: 503 });
    await entered.promise;
    const original = global.setTimeout;
    jest
      .spyOn(global, 'setTimeout')
      .mockImplementation(((
        callback: (...args: unknown[]) => void,
        delay?: number,
        ...args: unknown[]
      ) =>
        original(
          callback,
          delay === 30000 || delay === 60000 ? 30 : delay,
          ...args,
        )) as typeof setTimeout);
    await (Reflect.get(gateway.consumer, 'channel') as ProfileConsumerChannel).close();
    expect(gateway.delivery.isBrokerReady).toBe(false);
    expect(client.closed).toBe(true);
    expect(await stream.next()).toMatchObject({ done: true });
    release.open();
    await rejected;
    await until(() => gateway.delivery.isBrokerReady);
    expect(
      rabbit.queues().some((queue) => queue.name.startsWith('amq.gen-') && queue.name !== previous),
    ).toBe(true);
    const current = await subscribe({ gateway });
    const value = event();
    await publish(value);
    expect(await current.next()).toMatchObject({ value: { post: { postId: value.postId } } });
    await current.return?.();
    await gateway.consumer.onModuleDestroy();
    expect(gateway.delivery.isBrokerReady).toBe(false);
    expect(await gateway.delivery.handle(event())).toBe('disconnected');
    const unauthorized = access();
    unauthorized.revoked = true;
    await expect(gateway.factory.create({ context: unauthorized.context })).rejects.toMatchObject({
      code: 401,
    });
    await expect(gateway.factory.create({ context: access().context })).rejects.toMatchObject({
      code: 503,
    });
  });
});
