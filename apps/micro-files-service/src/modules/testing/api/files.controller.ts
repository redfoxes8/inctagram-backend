import { Controller, Get, Logger, Query } from '@nestjs/common';

@Controller('files')
export class FilesController {
  private readonly logger = new Logger(FilesController.name);

  @Get('log')
  logMessage(@Query('text') text: string): { ok: true } {
    this.logger.log(`[Files MS] Принято сообщение: ${text ?? ''}`);

    return { ok: true };
  }
}
