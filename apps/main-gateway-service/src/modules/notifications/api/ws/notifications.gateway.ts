import { Inject } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayInit, WebSocketGateway } from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';

import { IJwtService } from '../../../auth/application/interfaces/jwt.service.interface';
import { NotificationRealtimePublisher } from '../../realtime/notification-realtime.publisher';
import { NotificationUserRoomFactory } from '../../realtime/notification-user-room.factory';

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
  ) {}

  public afterInit(server: Namespace): void {
    this.publisher.bind(server);
    server.use((socket, next) => {
      const accessToken = this.accessToken(socket);
      if (!accessToken) {
        next(this.unauthorizedError());
        return;
      }

      try {
        const payload = this.jwtService.verifyAccessToken(accessToken);
        socket.data.notificationUserId = payload.userId;
        next();
      } catch {
        next(this.unauthorizedError());
      }
    });
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
