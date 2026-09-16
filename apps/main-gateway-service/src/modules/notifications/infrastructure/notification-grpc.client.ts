import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { type ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, timeout, TimeoutError } from 'rxjs';

import {
  NOTIFICATION_SERVICE_NAME,
  type GetNotificationsRequest,
  type GetNotificationsResponse,
  type GetUnseenNotificationCountRequest,
  type GetUnseenNotificationCountResponse,
  type MarkNotificationsSeenRequest,
  type MarkNotificationsSeenResponse,
  type NotificationServiceClient,
} from '../../../../../../libs/contracts/src';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { GrpcErrorMapper } from '../../../../../../libs/common/src/grpc/grpc-error.mapper';
import { NOTIFICATION_SERVICE_GRPC_CLIENT } from '../notification.constants';

const NOTIFICATION_GRPC_TIMEOUT_MS = 3_000;

@Injectable()
export class NotificationGrpcClient implements OnModuleInit {
  private notificationService: NotificationServiceClient;

  constructor(
    @Inject(NOTIFICATION_SERVICE_GRPC_CLIENT)
    private readonly client: ClientGrpc,
  ) {}

  public onModuleInit(): void {
    this.notificationService =
      this.client.getService<NotificationServiceClient>(NOTIFICATION_SERVICE_NAME);
  }

  public getNotifications(request: GetNotificationsRequest): Promise<GetNotificationsResponse> {
    return this.request(() => this.notificationService.getNotifications(request));
  }

  public getUnseenNotificationCount(
    request: GetUnseenNotificationCountRequest,
  ): Promise<GetUnseenNotificationCountResponse> {
    return this.request(() => this.notificationService.getUnseenNotificationCount(request));
  }

  public markNotificationsSeen(
    request: MarkNotificationsSeenRequest,
  ): Promise<MarkNotificationsSeenResponse> {
    return this.request(() => this.notificationService.markNotificationsSeen(request));
  }

  private async request<TResponse>(
    call: () => import('rxjs').Observable<TResponse>,
  ): Promise<TResponse> {
    try {
      return await firstValueFrom(call().pipe(timeout(NOTIFICATION_GRPC_TIMEOUT_MS)));
    } catch (error: unknown) {
      if (error instanceof TimeoutError) {
        throw new DomainException({
          code: DomainExceptionCode.GatewayTimeout,
          message: 'Notification service timeout',
        });
      }
      throw GrpcErrorMapper.toDomainException(error);
    }
  }
}
