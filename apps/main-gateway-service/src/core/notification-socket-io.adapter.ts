import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server, ServerOptions } from 'socket.io';

import { GatewayConfig } from './gateway.config';

export const NOTIFICATION_SOCKET_PATH = '/socket.io';

export class NotificationSocketIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly config: GatewayConfig,
  ) {
    super(app);
  }

  public override createIOServer(port: number, options?: ServerOptions): Server {
    return super.createIOServer(port, {
      ...options,
      path: NOTIFICATION_SOCKET_PATH,
      transports: ['websocket'],
      cors: {
        origin: this.config.notificationWsAllowedOrigins,
        credentials: true,
      },
    }) as Server;
  }
}
