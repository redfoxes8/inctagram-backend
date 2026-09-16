import { Injectable, Logger } from '@nestjs/common';
import type { Namespace } from 'socket.io';

import {
  NOTIFICATION_WEBSOCKET_EVENT,
  type NotificationCreatedWebSocketPayload,
  type NotificationsUnseenCountWebSocketPayload,
} from '../../../../../../libs/contracts/src';
import { NotificationUserRoomFactory } from './notification-user-room.factory';

@Injectable()
export class NotificationRealtimePublisher {
  private readonly logger = new Logger(NotificationRealtimePublisher.name);
  private namespace: Namespace | undefined;

  public bind(namespace: Namespace): void {
    this.namespace = namespace;
  }

  public publishNotificationCreated(
    userId: string,
    payload: NotificationCreatedWebSocketPayload,
  ): void {
    this.emit(userId, NOTIFICATION_WEBSOCKET_EVENT.CREATED, payload);
  }

  public publishUnseenCount(
    userId: string,
    payload: NotificationsUnseenCountWebSocketPayload,
  ): void {
    this.emit(userId, NOTIFICATION_WEBSOCKET_EVENT.UNSEEN_COUNT, payload);
  }

  private emit(userId: string, event: string, payload: object): void {
    try {
      const namespace = this.namespace;
      if (!namespace) return;
      const room = namespace.adapter.rooms.get(NotificationUserRoomFactory.forUser(userId));
      const connections = room?.size ?? 0;
      if (connections === 0) {
        this.logger.log({ event: 'notification.websocket.offline', connections: 0 });
        return;
      }
      namespace.to(NotificationUserRoomFactory.forUser(userId)).emit(event, payload);
      this.logger.log({ event: 'notification.websocket.delivered', connections });
    } catch {
      // Realtime delivery is best-effort; persisted Notification state remains authoritative.
    }
  }
}
