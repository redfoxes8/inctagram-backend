import { Injectable } from '@nestjs/common';
import type { Namespace } from 'socket.io';

import {
  NOTIFICATION_WEBSOCKET_EVENT,
  type NotificationCreatedWebSocketPayload,
  type NotificationsUnseenCountWebSocketPayload,
} from '../../../../../../libs/contracts/src';
import { NotificationUserRoomFactory } from './notification-user-room.factory';

@Injectable()
export class NotificationRealtimePublisher {
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
      this.namespace?.to(NotificationUserRoomFactory.forUser(userId)).emit(event, payload);
    } catch {
      // Realtime delivery is best-effort; persisted Notification state remains authoritative.
    }
  }
}
