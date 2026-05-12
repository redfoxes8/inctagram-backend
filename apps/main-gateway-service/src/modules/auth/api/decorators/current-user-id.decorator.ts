import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import type { CurrentUserInfo } from '../../../../../../../libs/common/types/auth.types';

export const CurrentUserId = createParamDecorator(
  (data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<{ user?: CurrentUserInfo }>();

    return request.user?.userId ?? '';
  },
);
