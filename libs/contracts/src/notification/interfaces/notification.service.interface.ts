import { Observable } from 'rxjs';

import {
  GetNotificationsRequest,
  GetNotificationsResponse,
  GetUnseenNotificationCountRequest,
  GetUnseenNotificationCountResponse,
  MarkNotificationsSeenRequest,
  MarkNotificationsSeenResponse,
} from '../../generated/inctagram/notification/v1/notification';

export abstract class INotificationServiceClient {
  abstract getNotifications(request: GetNotificationsRequest): Observable<GetNotificationsResponse>;

  abstract getUnseenNotificationCount(
    request: GetUnseenNotificationCountRequest,
  ): Observable<GetUnseenNotificationCountResponse>;

  abstract markNotificationsSeen(
    request: MarkNotificationsSeenRequest,
  ): Observable<MarkNotificationsSeenResponse>;
}
