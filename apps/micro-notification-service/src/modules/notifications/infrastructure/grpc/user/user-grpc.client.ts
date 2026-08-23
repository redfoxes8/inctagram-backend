import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { type ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, retry, TimeoutError, timer, timeout } from 'rxjs';
import { status } from '@grpc/grpc-js';
import { NotificationConfig } from '../../../../../core/notification.config';
import { DomainException, DomainExceptionCode } from '../../../../../../../../libs/common/src';

import { USER_SERVICE_GRPC_CLIENT } from './user-grpc.constants';
import { GrpcErrorMapper } from '../../../../../../../../libs/common/src/grpc/grpc-error.mapper';
import {
  USER_SERVICE_NAME,
  UserServiceClient,
  GetUserByIdRequest,
  GetUserByIdResponse,
  GetNotificationRecipientContextRequest,
  GetNotificationRecipientContextResponse,
} from '../../../../../../../../libs/contracts/src';

@Injectable()
export class UserGrpcClient implements OnModuleInit {
  private userService: UserServiceClient;

  constructor(
    @Inject(USER_SERVICE_GRPC_CLIENT)
    private readonly client: ClientGrpc,
    private readonly config: NotificationConfig,
  ) {}

  onModuleInit(): void {
    this.userService = this.client.getService<UserServiceClient>(USER_SERVICE_NAME);
  }

  async getUserById(request: GetUserByIdRequest): Promise<GetUserByIdResponse> {
    try {
      return await firstValueFrom(this.userService.getUserById(request));
    } catch (error) {
      throw GrpcErrorMapper.toDomainException(error);
    }
  }

  async getNotificationRecipientContext(
    request: GetNotificationRecipientContextRequest,
  ): Promise<GetNotificationRecipientContextResponse> {
    try {
      return await firstValueFrom(
        this.userService.getNotificationRecipientContext(request).pipe(
          timeout({ each: this.config.recipientGrpcTimeoutMs }),
          retry({
            count: this.config.recipientGrpcMaxRetries,
            delay: (error: unknown) => {
              if (this.isRetryableGrpcError(error)) {
                return timer(this.config.recipientGrpcRetryBackoffMs);
              }
              throw error;
            },
          }),
        ),
      );
    } catch (error) {
      if (error instanceof TimeoutError) {
        throw new DomainException({
          code: DomainExceptionCode.GatewayTimeout,
          message: 'Gateway recipient context request timed out',
        });
      }
      throw GrpcErrorMapper.toDomainException(error);
    }
  }

  private isRetryableGrpcError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null || !('code' in error)) return false;
    const code = error.code;
    return code === status.UNAVAILABLE || code === status.DEADLINE_EXCEEDED;
  }
}
