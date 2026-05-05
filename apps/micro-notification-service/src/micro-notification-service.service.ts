import { Injectable } from '@nestjs/common';

@Injectable()
export class MicroNotificationServiceService {
  getHello(): string {
    return 'Hello World!';
  }
}
