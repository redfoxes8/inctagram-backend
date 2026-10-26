import { Logger } from '@nestjs/common';
import { UserAccessRevokeRelay } from '../../src/modules/users/infrastructure/outbox/user-access-revoke-relay';
import { PaymentUserProfileRelay } from '../../src/modules/users/infrastructure/outbox/payment-user-profile-relay';
import { PostPublishedRelay } from '../../../micro-post-service/src/modules/posts/infrastructure/post-published.relay';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { GatewayConfig } from '../../src/core/gateway.config';
import { PrismaService as PostPrisma } from '../../../micro-post-service/src/core/prisma/prisma.service';
import { PostConfig } from '../../../micro-post-service/src/core/post.config';
import { PaymentProfileBootstrapWorker } from '../../../micro-payment-service/src/modules/payment/infrastructure/schedulers/payment-profile-bootstrap.worker';
import { PaymentProfileBootstrapService } from '../../../micro-payment-service/src/modules/payment/application/services/payment-profile-bootstrap.service';
import { PaymentConfig } from '../../../micro-payment-service/src/core/payment.config';
import { PostProfileBootstrapWorker } from '../../../micro-post-service/src/modules/posts/infrastructure/schedulers/post-profile-bootstrap.worker';
import { PostProfileBootstrapService } from '../../../micro-post-service/src/modules/posts/application/services/post-profile-bootstrap.service';
import { BACKGROUND_IDLE_MS } from '../../../../libs/common/src/constants/background-polling';
import type { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { randomUUID } from 'node:crypto';
import { PaymentProfileConfirmPublisher } from '../../../../libs/common/src/messaging/payment-profile-confirm-publisher';
import { IProjectionBootstrapRepository } from '../../../micro-payment-service/src/modules/payment/application/ports/payment-profile-bootstrap.port';
import { PostProjectionProgress } from '../../../micro-post-service/src/modules/posts/application/ports/post-profile-bootstrap.port';

function fixture(kind: string): {
  relay: UserAccessRevokeRelay | PaymentUserProfileRelay | PostPublishedRelay;
  query: jest.Mock;
} {
  const query = jest.fn().mockResolvedValue([]);
  const prisma = {
    $queryRaw: query,
    $executeRaw: jest.fn().mockResolvedValue(1),
  } as unknown as PrismaService;
  const relay =
    kind === 'revoke'
      ? new UserAccessRevokeRelay(prisma, {} as AmqpConnection, { now: () => new Date() })
      : kind === 'profile'
        ? new PaymentUserProfileRelay(prisma, { rabbitmqUrl: '' } as GatewayConfig)
        : new PostPublishedRelay(prisma as unknown as PostPrisma, { rabbitUrl: '' } as PostConfig);
  return { relay, query };
}

describe('bounded background scheduling', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it.each(['revoke', 'profile', 'published'])(
    '%s: startup, coalesced signals, recovery and shutdown',
    async (kind) => {
      const { relay, query } = fixture(kind);
      relay.onModuleInit();
      await jest.advanceTimersByTimeAsync(0);
      expect(query).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(BACKGROUND_IDLE_MS - 1);
      expect(query).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      expect(query).toHaveBeenCalledTimes(2);
      for (let signal = 0; signal < 10; signal++) relay.wake();
      await jest.advanceTimersByTimeAsync(0);
      expect(query).toHaveBeenCalledTimes(3);
      await relay.onModuleDestroy();
      relay.wake();
      await jest.advanceTimersByTimeAsync(BACKGROUND_IDLE_MS * 2);
      expect(query).toHaveBeenCalledTimes(3);
    },
  );

  it.each(['revoke', 'profile', 'published'])(
    '%s: signal during empty claim is retained; failures cannot storm',
    async (kind) => {
      const { relay, query } = fixture(kind);
      let release!: (rows: unknown[]) => void;
      query.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      );
      relay.onModuleInit();
      await jest.advanceTimersByTimeAsync(0);
      relay.wake();
      release([]);
      await jest.advanceTimersByTimeAsync(0);
      expect(query).toHaveBeenCalledTimes(2);
      query.mockRejectedValueOnce(new Error('fixture storage unavailable'));
      relay.wake();
      await jest.advanceTimersByTimeAsync(0);
      expect(query).toHaveBeenCalledTimes(3);
      for (let signal = 0; signal < 10; signal++) relay.wake();
      await jest.advanceTimersByTimeAsync(29999);
      expect(query).toHaveBeenCalledTimes(3);
      await jest.advanceTimersByTimeAsync(1);
      expect(query).toHaveBeenCalledTimes(4);
      await relay.onModuleDestroy();
    },
  );

  it.each(['Payment', 'Post'])(
    '%s bootstrap respects idle, retry and active batch times',
    async (kind) => {
      const runOnce = jest
        .fn()
        .mockImplementation(() => Promise.resolve(new Date(Date.now() + 24 * 60 * 60 * 1000)));
      const worker =
        kind === 'Payment'
          ? new PaymentProfileBootstrapWorker(
              { userProjectionSyncEnabled: true } as PaymentConfig,
              {
                runOnce,
                onConsumerConnected: () => () => {},
              } as unknown as PaymentProfileBootstrapService,
            )
          : new PostProfileBootstrapWorker(
              { userProjectionSyncEnabled: true } as PostConfig,
              {
                runOnce,
                stop: () => {},
                onConsumerConnected: () => () => {},
              } as unknown as PostProfileBootstrapService,
            );
      worker.onModuleInit();
      await jest.advanceTimersByTimeAsync(1000);
      expect(runOnce).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(BACKGROUND_IDLE_MS - 1);
      expect(runOnce).toHaveBeenCalledTimes(1);
      runOnce.mockImplementationOnce(() => Promise.resolve(new Date(Date.now() + 30000)));
      await jest.advanceTimersByTimeAsync(1);
      expect(runOnce).toHaveBeenCalledTimes(2);
      await jest.advanceTimersByTimeAsync(29999);
      expect(runOnce).toHaveBeenCalledTimes(2);
      runOnce.mockImplementationOnce(() => Promise.resolve(new Date(Date.now() + 1000)));
      await jest.advanceTimersByTimeAsync(1);
      expect(runOnce).toHaveBeenCalledTimes(3);
      await jest.advanceTimersByTimeAsync(1000);
      expect(runOnce).toHaveBeenCalledTimes(4);
      await worker.onModuleDestroy();
      await jest.advanceTimersByTimeAsync(BACKGROUND_IDLE_MS * 2);
      expect(runOnce).toHaveBeenCalledTimes(4);
    },
  );

  it('bounds backlog draining and yields between batches', async () => {
    const { relay, query } = fixture('profile');
    const publisher = Reflect.get(relay, 'publisher') as PaymentProfileConfirmPublisher;
    jest.spyOn(publisher, 'publish').mockResolvedValue();
    let remaining = 23;
    query.mockImplementation(() => {
      if (remaining-- <= 0) return Promise.resolve([]);
      const id = randomUUID();
      return Promise.resolve([
        {
          id,
          userId: 'source-text-id',
          sourceVersion: 1n,
          attempts: 1,
          payload: {
            eventId: id,
            eventType: 'payment.user-profile.changed.v1',
            schemaVersion: 1,
            occurredAt: new Date().toISOString(),
            userId: 'source-text-id',
            sourceVersion: '1',
            username: null,
            profileExists: false,
            isDeleted: false,
          },
        },
      ]);
    });
    relay.onModuleInit();
    await jest.advanceTimersByTimeAsync(0);
    expect(query).toHaveBeenCalledTimes(20);
    await jest.advanceTimersByTimeAsync(99);
    expect(query).toHaveBeenCalledTimes(20);
    await jest.advanceTimersByTimeAsync(1);
    expect(query).toHaveBeenCalledTimes(24); // Remaining three plus the empty claim.
    await relay.onModuleDestroy();
  });

  it.each(['Payment', 'Post'])(
    '%s consumer reconnect wakes only a worker waiting for connectivity',
    async (kind) => {
      let connected = false;
      let onConnect = (): void => {};
      const consumer = {
        isConnected: (): boolean => connected,
        onConnected: (listener: () => void): (() => void) => {
          onConnect = listener;
          return (): void => {
            onConnect = (): void => {};
          };
        },
      };
      const claim = jest.fn().mockResolvedValue(null);
      const repository = { claim, nextCheckAt: new Date(Date.now() + BACKGROUND_IDLE_MS) };
      const exporter = { exportPage: jest.fn() };
      const worker =
        kind === 'Payment'
          ? new PaymentProfileBootstrapWorker(
              { userProjectionSyncEnabled: true } as PaymentConfig,
              new PaymentProfileBootstrapService(
                repository as unknown as IProjectionBootstrapRepository,
                exporter,
                consumer,
              ),
            )
          : new PostProfileBootstrapWorker(
              { userProjectionSyncEnabled: true } as PostConfig,
              new PostProfileBootstrapService(
                repository as unknown as PostProjectionProgress,
                exporter,
                consumer,
              ),
            );
      worker.onModuleInit();
      await jest.advanceTimersByTimeAsync(1000);
      expect(claim).not.toHaveBeenCalled();
      connected = true;
      onConnect();
      await jest.advanceTimersByTimeAsync(1000);
      expect(claim).toHaveBeenCalledTimes(1);
      onConnect();
      await jest.advanceTimersByTimeAsync(5000);
      expect(claim).toHaveBeenCalledTimes(1);
      await worker.onModuleDestroy();
      onConnect();
      await jest.advanceTimersByTimeAsync(BACKGROUND_IDLE_MS);
      expect(claim).toHaveBeenCalledTimes(1);
    },
  );
});
