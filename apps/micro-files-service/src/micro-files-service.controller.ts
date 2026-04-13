import { Controller, Get } from '@nestjs/common';
import { MicroFilesServiceService } from './micro-files-service.service';

@Controller()
export class MicroFilesServiceController {
  constructor(private readonly microFilesServiceService: MicroFilesServiceService) {}

  @Get()
  getHello(): string {
    return this.microFilesServiceService.getHello();
  }
}
