import { Injectable } from '@nestjs/common';

import { DomainException, DomainExceptionCode, GLOBAL_PREFIX } from '../../../../libs/common/src';
import { GatewayConfig } from '../core/gateway.config';

type SendTestLogParams = {
  text: string;
};

export type SendTestLogResult = {
  status: 'sent';
  receivedByFiles: boolean;
};

@Injectable()
export class FilesHttpClient {
  constructor(private readonly gatewayConfig: GatewayConfig) {}

  async sendTestLog(params: SendTestLogParams): Promise<SendTestLogResult> {
    const filesServiceUrl = this.gatewayConfig.filesServiceUrl;

    if (!filesServiceUrl) {
      throw new DomainException({
        code: DomainExceptionCode.InternalServerError,
        message: 'FILES_SERVICE_URL is not set',
      });
    }

    const url = new URL(`/${GLOBAL_PREFIX}/files/log`, filesServiceUrl);
    url.searchParams.set('text', params.text);

    let response: Response;
    try {
      response = await fetch(url.toString(), { method: 'GET' });
    } catch {
      throw new DomainException({
        code: DomainExceptionCode.InternalServerError,
        message: 'Failed to send request to files service',
      });
    }

    if (!response.ok) {
      throw new DomainException({
        code: DomainExceptionCode.InternalServerError,
        message: 'Files service responded with an error',
      });
    }

    return {
      status: 'sent',
      receivedByFiles: true,
    };
  }
}
