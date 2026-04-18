import { Global, Module } from '@nestjs/common';
import { GatewayConfig } from './gateway.config';

@Global()
@Module({
  providers: [GatewayConfig],
  exports: [GatewayConfig],
})
export class GatewayConfigModule {}
