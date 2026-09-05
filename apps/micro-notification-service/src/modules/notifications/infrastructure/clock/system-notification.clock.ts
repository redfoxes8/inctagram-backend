import { Injectable } from '@nestjs/common';

import { NotificationClock } from '../../application/ports/notification-clock.port';

@Injectable()
export class SystemNotificationClock extends NotificationClock {
  public now(): Date {
    return new Date();
  }
}
