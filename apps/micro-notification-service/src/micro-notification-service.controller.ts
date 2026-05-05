import { Controller, Get } from '@nestjs/common';
import { MicroNotificationServiceService } from './micro-notification-service.service';

@Controller()
export class MicroNotificationServiceController {
  constructor(private readonly microNotificationServiceService: MicroNotificationServiceService) {}

  @Get()
  getHello(): string {
    return this.microNotificationServiceService.getHello();
  }
}
