import { Injectable } from '@nestjs/common';
import { AdminClock } from '../domain/admin-clock';

@Injectable()
export class SystemAdminClock extends AdminClock {
  now(): Date {
    return new Date();
  }
}
