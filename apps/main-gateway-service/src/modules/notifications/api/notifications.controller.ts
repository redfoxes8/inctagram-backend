import { Controller, Get, HttpCode, HttpStatus, Patch, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiGatewayTimeoutResponse,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { JwtGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUserId } from '../../auth/api/decorators/current-user-id.decorator';
import { NotificationGrpcClient } from '../infrastructure/notification-grpc.client';
import { GetNotificationsQueryDto } from './dto/get-notifications.query.dto';
import {
  GetNotificationsResponseDto,
  MarkNotificationsSeenResponseDto,
  NotificationApiErrorResponseDto,
  UnseenNotificationCountResponseDto,
} from './dto/notification-response.dto';
import { NotificationResponseMapper } from './notification-response.mapper';
import { NotificationLiveEventPublisher } from '../infrastructure/notification-live-event.publisher';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationGrpcClient: NotificationGrpcClient,
    private readonly liveEventPublisher: NotificationLiveEventPublisher,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get notification history',
    description: 'Returns the current UTC calendar month in newest-first opaque cursor order.',
  })
  @ApiOkResponse({ type: GetNotificationsResponseDto })
  @ApiBadRequestResponse({
    type: NotificationApiErrorResponseDto,
    description: 'Pagination parameters or cursor are invalid.',
  })
  @ApiUnauthorizedResponse({ type: NotificationApiErrorResponseDto })
  @ApiServiceUnavailableResponse({
    type: NotificationApiErrorResponseDto,
    description: 'Notification service is unavailable.',
  })
  @ApiGatewayTimeoutResponse({
    type: NotificationApiErrorResponseDto,
    description: 'Notification service request timed out.',
  })
  @ApiInternalServerErrorResponse({ type: NotificationApiErrorResponseDto })
  public async getNotifications(
    @CurrentUserId() userId: string,
    @Query() query: GetNotificationsQueryDto,
  ): Promise<GetNotificationsResponseDto> {
    const response = await this.notificationGrpcClient.getNotifications({
      userId,
      cursor: query.cursor,
      pageSize: query.pageSize,
    });
    return NotificationResponseMapper.history(response);
  }

  @Get('unseen-count')
  @ApiOperation({ summary: 'Get unseen notification count' })
  @ApiOkResponse({ type: UnseenNotificationCountResponseDto })
  @ApiUnauthorizedResponse({ type: NotificationApiErrorResponseDto })
  @ApiServiceUnavailableResponse({
    type: NotificationApiErrorResponseDto,
    description: 'Notification service is unavailable.',
  })
  @ApiGatewayTimeoutResponse({
    type: NotificationApiErrorResponseDto,
    description: 'Notification service request timed out.',
  })
  @ApiInternalServerErrorResponse({ type: NotificationApiErrorResponseDto })
  public async getUnseenNotificationCount(
    @CurrentUserId() userId: string,
  ): Promise<UnseenNotificationCountResponseDto> {
    const response = await this.notificationGrpcClient.getUnseenNotificationCount({ userId });
    return NotificationResponseMapper.unseenCount(response.unseenCount);
  }

  @Patch('seen')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark notifications as seen',
    description:
      'Marks all currently unseen notifications through the Notification service server time.',
  })
  @ApiOkResponse({ type: MarkNotificationsSeenResponseDto })
  @ApiUnauthorizedResponse({ type: NotificationApiErrorResponseDto })
  @ApiServiceUnavailableResponse({
    type: NotificationApiErrorResponseDto,
    description: 'Notification service is unavailable.',
  })
  @ApiGatewayTimeoutResponse({
    type: NotificationApiErrorResponseDto,
    description: 'Notification service request timed out.',
  })
  @ApiInternalServerErrorResponse({ type: NotificationApiErrorResponseDto })
  public async markNotificationsSeen(
    @CurrentUserId() userId: string,
  ): Promise<MarkNotificationsSeenResponseDto> {
    const response = await this.notificationGrpcClient.markNotificationsSeen({ userId });
    const result = NotificationResponseMapper.markSeen(response);
    await this.liveEventPublisher.publishUnseenCountChanged({
      userId,
      unseenCount: result.unseenCount,
      seenThrough: result.seenThrough,
    });
    return result;
  }
}
