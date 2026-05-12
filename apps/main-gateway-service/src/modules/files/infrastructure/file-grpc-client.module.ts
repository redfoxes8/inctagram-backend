import { Module } from '@nestjs/common';
import { ClientsModule, type ClientProviderOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';

import { GatewayConfig } from '../../../core/gateway.config';
import { GatewayConfigModule } from '../../../core/gateway-config.module';
import { INCTAGRAM_FILE_V1_PACKAGE_NAME } from '../../../../../../libs/contracts/src';
import { FILE_SERVICE_GRPC_CLIENT } from './file-grpc.constants';
import { FileGrpcClient } from './file-grpc.client';

@Module({
  imports: [
    GatewayConfigModule,
    ClientsModule.registerAsync([
      {
        name: FILE_SERVICE_GRPC_CLIENT,
        imports: [GatewayConfigModule],
        inject: [GatewayConfig],
        useFactory: (config: GatewayConfig): ClientProviderOptions => ({
          name: FILE_SERVICE_GRPC_CLIENT,
          transport: Transport.GRPC,
          options: {
            package: INCTAGRAM_FILE_V1_PACKAGE_NAME,
            protoPath: join(process.cwd(), 'libs/contracts/src/proto/file.proto'),
            url: config.fileServiceGrpcUrl,
          },
        }),
      },
    ]),
  ],
  providers: [FileGrpcClient],
  exports: [FileGrpcClient],
})
export class FileGrpcClientModule {}
