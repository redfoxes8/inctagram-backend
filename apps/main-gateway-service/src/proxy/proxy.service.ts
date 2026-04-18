import { Injectable } from '@nestjs/common';
import { GatewayConfig } from '../core/gateway.config';
import { CoreConfig } from '../../../../libs/common/src/core.config';

@Injectable()
export class ProxyService {
  constructor(
    private readonly gatewayConfig: GatewayConfig, // Локальный конфиг гейтвея
    private readonly coreConfig: CoreConfig, // Общий конфиг из либ
  ) {}

  // Пример использования
  getFilesServiceUrl() {
    return this.gatewayConfig.port; // Например, http://localhost:8877
  }
}
