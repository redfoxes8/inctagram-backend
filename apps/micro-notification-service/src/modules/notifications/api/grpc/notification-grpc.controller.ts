import { Controller, UseInterceptors } from '@nestjs/common';

import {
  NotificationServiceController,
  NotificationServiceControllerMethods,
  type GetNotificationsRequest,
  type GetNotificationsResponse,
  type GetUnseenNotificationCountRequest,
  type GetUnseenNotificationCountResponse,
  type MarkNotificationsSeenRequest,
  type MarkNotificationsSeenResponse,
} from '../../../../../../../libs/contracts/src';
import { GrpcExceptionInterceptor } from '../../../../../../../libs/common/src/exceptions/grpc-exception.interceptor';
import { NotificationClock } from '../../application/ports/notification-clock.port';
import { GetNotificationsService } from '../../application/services/get-notifications.service';
import { GetUnseenNotificationCountService } from '../../application/services/get-unseen-notification-count.service';
import { MarkNotificationsSeenService } from '../../application/services/mark-notifications-seen.service';
import { NotificationGrpcResponseMapper } from './notification-grpc-response.mapper';

@Controller()
@UseInterceptors(GrpcExceptionInterceptor)
@NotificationServiceControllerMethods()
export class NotificationGrpcController implements NotificationServiceController {
  constructor(
    private readonly getNotificationsService: GetNotificationsService,
    private readonly getUnseenNotificationCountService: GetUnseenNotificationCountService,
    private readonly markNotificationsSeenService: MarkNotificationsSeenService,
    private readonly clock: NotificationClock,
  ) {}

  public async getNotifications(
    request: GetNotificationsRequest,
  ): Promise<GetNotificationsResponse> {
    const result = await this.getNotificationsService.execute({
      userId: request.userId,
      cursor: request.cursor,
      pageSize: request.pageSize,
      now: this.clock.now(),
    });
    return NotificationGrpcResponseMapper.history(result);
  }

  public async getUnseenNotificationCount(
    request: GetUnseenNotificationCountRequest,
  ): Promise<GetUnseenNotificationCountResponse> {
    return NotificationGrpcResponseMapper.unseenCount(
      await this.getUnseenNotificationCountService.execute(request.userId),
    );
  }

  public async markNotificationsSeen(
    request: MarkNotificationsSeenRequest,
  ): Promise<MarkNotificationsSeenResponse> {
    return NotificationGrpcResponseMapper.markSeen(
      await this.markNotificationsSeenService.execute(request.userId),
    );
  }
}
