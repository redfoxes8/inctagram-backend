import { BadRequestException, Controller, Get, Query } from '@nestjs/common';

import { FilesHttpClient } from '../infrastructure/files-http.client';

@Controller('gateway')
export class GatewayController {
  constructor(private readonly filesHttpClient: FilesHttpClient) {}

  // локальный тест http://localhost:3000/api/v1/gateway/test-log?text=ConnectSuccessfully
  @Get('test-log')
  async testLog(
    @Query('text') text: string,
  ): Promise<{ status: 'sent'; receivedByFiles: boolean }> {
    if (!text?.trim()) {
      throw new BadRequestException('Query parameter "text" is required');
    }

    return this.filesHttpClient.sendTestLog({ text });
  }
}
