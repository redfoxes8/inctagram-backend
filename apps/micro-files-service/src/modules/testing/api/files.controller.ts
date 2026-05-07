import { Controller, Get, Inject, Logger, OnModuleInit, Query } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

import { IPostServiceClient } from '../../../../../../libs/contracts/src';

@Controller('files')
export class FilesController implements OnModuleInit {
  private readonly logger = new Logger(FilesController.name);
  private postService: IPostServiceClient;

  constructor(@Inject('POST_SERVICE_PACKAGE') private readonly client: any) {}

  onModuleInit(): void {
    this.postService = this.client.getService('PostService');
  }

  @Get('log')
  logMessage(@Query('text') text: string): { ok: true } {
    this.logger.log(`[Files MS] Принято сообщение: ${text ?? ''}`);

    return { ok: true };
  }

  // http://localhost:4279/api/v1/files/test-post-ms-ping?text=hello
  @Get('test-post-ms-ping')
  async testPostMsPing(@Query('text') text: string): Promise<any> {
    this.logger.log(`[Files MS] Отправка gRPC Ping в Post-MS с текстом: ${text}`);

    try {
      const result = await firstValueFrom(this.postService.ping({ message: text }));

      return result;
    } catch (error: any) {
      this.logger.error(`[Files MS] Ошибка gRPC вызова: ${error.message}`);

      return { error: error.message };
    }
  }
}
