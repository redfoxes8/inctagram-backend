import { Module } from '@nestjs/common';
import { ClientsModule, type ClientProviderOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';

import { GatewayConfig } from '../../../core/gateway.config';
import { GatewayConfigModule } from '../../../core/gateway-config.module';
import { INCTAGRAM_POST_V1_PACKAGE_NAME } from '../../../../../../libs/contracts/src';
import { POST_SERVICE_GRPC_CLIENT } from './post-grpc.constants';
import { PostGrpcClient } from './post-grpc.client';

@Module({
  imports: [
    GatewayConfigModule,
    ClientsModule.registerAsync([
      {
        name: POST_SERVICE_GRPC_CLIENT,
        imports: [GatewayConfigModule],
        inject: [GatewayConfig],
        useFactory: (config: GatewayConfig): ClientProviderOptions => ({
          name: POST_SERVICE_GRPC_CLIENT,
          transport: Transport.GRPC,
          options: {
            package: INCTAGRAM_POST_V1_PACKAGE_NAME,
            protoPath: join(process.cwd(), 'libs/contracts/src/proto/post.proto'),
            url: config.postServiceGrpcUrl,
          },
        }),
      },
    ]),
  ],
  providers: [PostGrpcClient],
  exports: [PostGrpcClient],
})
export class PostGrpcClientModule {}
