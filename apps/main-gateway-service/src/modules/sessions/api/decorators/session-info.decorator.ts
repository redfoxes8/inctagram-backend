import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface SessionMetaData {
  ip: string;
  deviceName: string;
}

export const SessionInfo = createParamDecorator(
  (data: unknown, context: ExecutionContext): SessionMetaData => {
    const request = context.switchToHttp().getRequest();

    return {
      ip: request.ip || 'unknown',
      deviceName: request.headers['user-agent'] || 'unknown device',
    };
  },
);
