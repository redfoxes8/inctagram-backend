import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { isUUID } from 'class-validator';
import { COMMON_RABBITMQ_EXCHANGE } from '../../../core/gateway-rabbitmq.constants';
import {
  USER_ACCESS_REVOKED_EVENT_TYPE,
  USER_ACCESS_REVOKED_ROUTING_KEY,
} from '../../../../../../libs/contracts/src/user-access-revoked';
import { NotificationRealtimePublisher } from '../realtime/notification-realtime.publisher';

@Injectable()
export class UserAccessRevokedConsumer implements OnApplicationBootstrap {
  private readonly logger = new Logger(UserAccessRevokedConsumer.name);
  constructor(
    private readonly amqp: AmqpConnection,
    private readonly realtime: NotificationRealtimePublisher,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Ephemeral fan-out queues are recreated by the existing connection manager. Sweep on
    // reconnect as a safety net for a revoke sent while this Gateway lost its broker connection.
    this.amqp.managedConnection.on('connect', () => {
      void this.realtime.revalidateConnections();
    });
    await this.amqp.createSubscriber(
      async (input: unknown): Promise<void> => {
        if (typeof input !== 'object' || input === null) return;
        const event = input as Record<string, unknown>;
        if (
          event.version !== 1 ||
          event.eventType !== USER_ACCESS_REVOKED_EVENT_TYPE ||
          !isUUID(event.eventId) ||
          !isUUID(event.userId) ||
          !Array.isArray(event.sessionIds) ||
          !event.sessionIds.every((id: unknown) => isUUID(id))
        ) {
          this.logger.warn({ event: 'user.access.revoke.rejected', code: 'INVALID_EVENT' });
          return;
        }
        await this.realtime.disconnectSessions({
          userId: event.userId as string,
          sessionIds: event.sessionIds as string[],
        });
      },
      {
        exchange: COMMON_RABBITMQ_EXCHANGE,
        routingKey: USER_ACCESS_REVOKED_ROUTING_KEY,
        queueOptions: { durable: false, exclusive: true, autoDelete: true },
      },
      UserAccessRevokedConsumer.name,
    );
  }
}
