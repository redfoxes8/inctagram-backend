import { Inject } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayInit, WebSocketGateway } from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';

import { IJwtService } from '../../../auth/application/interfaces/jwt.service.interface';
import { NotificationRealtimePublisher } from '../../realtime/notification-realtime.publisher';
import { NotificationUserRoomFactory } from '../../realtime/notification-user-room.factory';
import { UserAccessCheck } from '../../../sessions/application/user-access-check';

export const NOTIFICATIONS_SOCKET_NAMESPACE = '/notifications';

@WebSocketGateway({
  namespace: NOTIFICATIONS_SOCKET_NAMESPACE,
  path: '/socket.io',
  transports: ['websocket'],
})
export class NotificationsGateway implements OnGatewayInit, OnGatewayConnection {
  constructor(
    @Inject(IJwtService) private readonly jwtService: IJwtService,
    private readonly publisher: NotificationRealtimePublisher,
    private readonly access: UserAccessCheck,
  ) {}

  public afterInit(server: Namespace): void {
    this.publisher.bind(server);
    server.use((socket, next) => {
      void this.authenticate({ socket, next });
    });
  }

  private async authenticate({
    socket,
    next,
  }: {
    socket: Socket;
    next: (error?: Error) => void;
  }): Promise<void> {
    const accessToken = this.accessToken(socket);
    if (!accessToken) {
      next(this.unauthorizedError());
      return;
    }

    try {
      const payload = this.jwtService.verifyAccessToken(accessToken);
      const session = await this.access.verify(payload);
      socket.data.notificationUserId = payload.userId;
      socket.data.notificationAccess = {
        userId: payload.userId,
        deviceId: payload.deviceId,
        exp: payload.exp,
        sessionId: session.sessionId,
      };
      next();
    } catch {
      next(this.unauthorizedError());
    }
  }

  public handleConnection(socket: Socket): void {
    const userId = this.userId(socket);
    if (!userId) {
      socket.disconnect(true);
      return;
    }
    void socket.join(NotificationUserRoomFactory.forUser(userId));
  }

  private accessToken(socket: Socket): string | undefined {
    const value: unknown = socket.handshake.auth.accessToken;
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private userId(socket: Socket): string | undefined {
    const value: unknown = socket.data.notificationUserId;
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private unauthorizedError(): Error & { data: { code: string } } {
    return Object.assign(new Error('Unauthorized'), { data: { code: 'UNAUTHORIZED' } });
  }
}
