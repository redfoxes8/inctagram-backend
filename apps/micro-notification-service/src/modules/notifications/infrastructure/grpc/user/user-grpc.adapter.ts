import { Injectable } from '@nestjs/common';

import { IUserGrpcAdapter } from './interfaces/user-grpc-adapter.interface';
import { UserGrpcClient } from './user-grpc.client';
import { UserGrpcDto } from './dto/user-grpc.dto';
import { DomainException, DomainExceptionCode } from '../../../../../../../../libs/common/src';
import { UserGrpcMapper } from './mappers/user-grpc.mapper';
import {
  NotificationRecipientContext,
  NotificationRecipientContextPort,
} from '../../../application/ports/notification-recipient-context.port';

@Injectable()
export class UserGrpcAdapter implements IUserGrpcAdapter, NotificationRecipientContextPort {
  constructor(private readonly userGrpcClient: UserGrpcClient) {}

  async getUserById(userId: string): Promise<UserGrpcDto> {
    const response = await this.userGrpcClient.getUserById({
      userId,
    });

    if (!response.user) {
      throw new DomainException({
        code: DomainExceptionCode.NotFound,
        message: 'User not found',
      });
    }

    return UserGrpcMapper.toDto(response.user);
  }

  async getNotificationRecipientContext(userId: string): Promise<NotificationRecipientContext> {
    const response = await this.userGrpcClient.getNotificationRecipientContext({ userId });

    return {
      userId: response.userId,
      email: response.email,
      userName: response.userName,
    };
  }
}
