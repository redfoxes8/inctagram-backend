import {
  NotificationType,
  type GetNotificationsResponse,
  type MarkNotificationsSeenResponse,
} from '../../../../libs/contracts/src';
import { NotificationsController } from '../../src/modules/notifications/api/notifications.controller';
import { NotificationResponseMapper } from '../../src/modules/notifications/api/notification-response.mapper';
import { NotificationGrpcClient } from '../../src/modules/notifications/infrastructure/notification-grpc.client';
import { NotificationRealtimePublisher } from '../../src/modules/notifications/realtime/notification-realtime.publisher';

const USER_ID = '10000000-0000-4000-8000-000000000001';

function createController(): {
  controller: NotificationsController;
  getNotifications: jest.Mock;
  getUnseenNotificationCount: jest.Mock;
  markNotificationsSeen: jest.Mock;
  publishUnseenCount: jest.Mock;
} {
  const getNotifications = jest.fn();
  const getUnseenNotificationCount = jest.fn();
  const markNotificationsSeen = jest.fn();
  const publishUnseenCount = jest.fn();
  const client = {
    getNotifications,
    getUnseenNotificationCount,
    markNotificationsSeen,
  } as unknown as NotificationGrpcClient;

  return {
    controller: new NotificationsController(client, {
      publishUnseenCount,
    } as unknown as NotificationRealtimePublisher),
    getNotifications,
    getUnseenNotificationCount,
    markNotificationsSeen,
    publishUnseenCount,
  };
}

describe('NotificationsController', () => {
  it('maps history and count with one authenticated gRPC call per endpoint', async () => {
    const {
      controller,
      getNotifications,
      getUnseenNotificationCount,
      markNotificationsSeen,
      publishUnseenCount,
    } = createController();
    const historyResponse: GetNotificationsResponse = {
      items: [
        {
          id: '20000000-0000-4000-8000-000000000001',
          type: NotificationType.NOTIFICATION_TYPE_SUBSCRIPTION_EXTENDED,
          subscriptionId: '30000000-0000-4000-8000-000000000001',
          effectiveAt: { seconds: 1_788_260_400, nanos: 0 },
          subscriptionEndsAt: { seconds: 1_790_851_200, nanos: 0 },
          createdAt: { seconds: 1_788_260_430, nanos: 0 },
        },
      ],
      nextCursor: 'opaque-next-cursor',
    };
    getNotifications.mockResolvedValue(historyResponse);
    getUnseenNotificationCount.mockResolvedValue({ unseenCount: 0 });

    await expect(
      controller.getNotifications(USER_ID, { cursor: 'opaque-input-cursor', pageSize: 25 }),
    ).resolves.toEqual({
      items: [
        {
          id: historyResponse.items[0].id,
          type: 'SUBSCRIPTION_EXTENDED',
          subscriptionId: historyResponse.items[0].subscriptionId,
          providerInvoiceId: undefined,
          effectiveAt: '2026-09-01T11:00:00.000Z',
          subscriptionEndsAt: '2026-10-01T10:40:00.000Z',
          reasonCode: undefined,
          createdAt: '2026-09-01T11:00:30.000Z',
          seenAt: undefined,
        },
      ],
      nextCursor: 'opaque-next-cursor',
    });
    await expect(controller.getUnseenNotificationCount(USER_ID)).resolves.toEqual({
      unseenCount: 0,
    });

    expect(getNotifications).toHaveBeenCalledTimes(1);
    expect(getNotifications).toHaveBeenCalledWith({
      userId: USER_ID,
      cursor: 'opaque-input-cursor',
      pageSize: 25,
    });
    expect(getUnseenNotificationCount).toHaveBeenCalledTimes(1);
    expect(getUnseenNotificationCount).toHaveBeenCalledWith({ userId: USER_ID });
    expect(markNotificationsSeen).not.toHaveBeenCalled();
    expect(publishUnseenCount).not.toHaveBeenCalled();

    expect(NotificationResponseMapper.history({} as GetNotificationsResponse)).toEqual({
      items: [],
      nextCursor: undefined,
    });
  });

  it('marks seen with only the authenticated user and returns server-owned boundary', async () => {
    const {
      controller,
      getNotifications,
      getUnseenNotificationCount,
      markNotificationsSeen,
      publishUnseenCount,
    } = createController();
    const response: MarkNotificationsSeenResponse = {
      seenThrough: { seconds: 1_788_260_500, nanos: 0 },
      unseenCount: 0,
    };
    markNotificationsSeen.mockResolvedValue(response);

    await expect(controller.markNotificationsSeen(USER_ID)).resolves.toEqual({
      seenThrough: '2026-09-01T11:01:40.000Z',
      unseenCount: 0,
    });

    expect(markNotificationsSeen).toHaveBeenCalledTimes(1);
    expect(markNotificationsSeen).toHaveBeenCalledWith({ userId: USER_ID });
    expect(publishUnseenCount).toHaveBeenCalledTimes(1);
    expect(publishUnseenCount).toHaveBeenCalledWith(USER_ID, { unseenCount: 0 });
    expect(getNotifications).not.toHaveBeenCalled();
    expect(getUnseenNotificationCount).not.toHaveBeenCalled();
  });
});
