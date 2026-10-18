import { Injectable, Logger } from '@nestjs/common';
import type { Namespace, Socket } from 'socket.io';
import {
  NOTIFICATION_WEBSOCKET_EVENT,
  type NotificationCreatedWebSocketPayload,
  type NotificationsUnseenCountWebSocketPayload,
} from '../../../../../../libs/contracts/src';
import { NotificationUserRoomFactory } from './notification-user-room.factory';
import {
  UserAccessCheck,
  type UserAccessCredential,
} from '../../sessions/application/user-access-check';

export type NotificationSocketAccess = UserAccessCredential & { sessionId: string };

@Injectable()
export class NotificationRealtimePublisher {
  private readonly logger = new Logger(NotificationRealtimePublisher.name);
  private namespace: Namespace | undefined;
  constructor(private readonly access: UserAccessCheck) {}

  public bind(namespace: Namespace): void {
    this.namespace = namespace;
  }

  public async publishNotificationCreated(
    userId: string,
    payload: NotificationCreatedWebSocketPayload,
  ): Promise<void> {
    await this.emit({ userId, event: NOTIFICATION_WEBSOCKET_EVENT.CREATED, payload });
  }

  public async publishUnseenCount(
    userId: string,
    payload: NotificationsUnseenCountWebSocketPayload,
  ): Promise<void> {
    await this.emit({ userId, event: NOTIFICATION_WEBSOCKET_EVENT.UNSEEN_COUNT, payload });
  }

  public async disconnectSessions(input: { userId: string; sessionIds: string[] }): Promise<void> {
    const revoked = new Set(input.sessionIds);
    for (const socket of this.namespace?.sockets.values() ?? []) {
      const credential = this.credential(socket);
      if (credential?.userId === input.userId) {
        if (revoked.has(credential.sessionId)) socket.disconnect(true);
        // Logout may already have physically removed a Session before block captured its IDs.
        // Recheck unmatched sockets; a late revoke must preserve a NEW valid session after unblock.
        else await this.allowed(socket);
      }
    }
  }

  public async revalidateConnections(): Promise<void> {
    for (const socket of this.namespace?.sockets.values() ?? []) await this.allowed(socket);
  }

  private credential(socket: Socket): NotificationSocketAccess | null {
    const value: unknown = socket.data.notificationAccess;
    if (typeof value !== 'object' || value === null) return null;
    const credential = value as Partial<NotificationSocketAccess>;
    return typeof credential.userId === 'string' &&
      typeof credential.deviceId === 'string' &&
      typeof credential.exp === 'number' &&
      typeof credential.sessionId === 'string'
      ? (credential as NotificationSocketAccess)
      : null;
  }

  private async allowed(socket: Socket): Promise<boolean> {
    const credential = this.credential(socket);
    if (credential) {
      try {
        const session = await this.access.verify(credential);
        if (session.sessionId === credential.sessionId && socket.connected) return true;
      } catch {
        /* Fail closed on storage failure as well as inactive/expired sessions. */
      }
    }
    socket.disconnect(true);
    return false;
  }

  private async emit(input: { userId: string; event: string; payload: object }): Promise<void> {
    const namespace = this.namespace;
    if (!namespace) return;
    const room = namespace.adapter.rooms.get(NotificationUserRoomFactory.forUser(input.userId));
    if (!room) {
      this.logger.log({ event: 'notification.websocket.offline', connections: 0 });
      return;
    }
    let connections = 0;
    for (const socketId of [...room]) {
      const socket = namespace.sockets.get(socketId);
      if (
        socket &&
        this.credential(socket)?.userId === input.userId &&
        (await this.allowed(socket))
      ) {
        // A block committed AFTER this check may race this already-started delivery.
        socket.emit(input.event, input.payload);
        connections++;
      }
    }
    this.logger.log({ event: 'notification.websocket.delivered', connections });
  }
}
