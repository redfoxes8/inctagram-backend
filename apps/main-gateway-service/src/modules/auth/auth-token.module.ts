import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { GatewayConfigModule } from '../../core/gateway-config.module';
import { GatewayConfig } from '../../core/gateway.config';
import { IJwtService } from './application/interfaces/jwt.service.interface';
import { JwtServiceImplementation } from './infrastructure/jwt.service';

@Module({
  imports: [
    GatewayConfigModule,
    JwtModule.registerAsync({
      imports: [GatewayConfigModule],
      inject: [GatewayConfig],
      useFactory: (config: GatewayConfig) => ({ secret: config.jwtSecret }),
    }),
  ],
  providers: [{ provide: IJwtService, useClass: JwtServiceImplementation }],
  exports: [IJwtService],
})
export class AuthTokenModule {}
