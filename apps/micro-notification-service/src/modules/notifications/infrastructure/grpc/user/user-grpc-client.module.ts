import { Module } from '@nestjs/common';
import { ClientsModule, ClientProviderOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';

import { USER_SERVICE_GRPC_CLIENT } from './user-grpc.constants';
import { UserGrpcClient } from './user-grpc.client';
import { UserGrpcAdapter } from './user-grpc.adapter';
import { IUserGrpcAdapter } from './interfaces/user-grpc-adapter.interface';
import { NotificationConfigModule } from '../../../../../core/notification-config.module';
import { NotificationConfig } from '../../../../../core/notification.config';
import { INCTAGRAM_USER_V1_PACKAGE_NAME } from '../../../../../../../../libs/contracts/src';
import { NotificationRecipientContextPort } from '../../../application/ports/notification-recipient-context.port';

@Module({
  imports: [
    NotificationConfigModule,
    ClientsModule.registerAsync([
      {
        name: USER_SERVICE_GRPC_CLIENT,
        imports: [NotificationConfigModule],
        inject: [NotificationConfig],
        useFactory: (config: NotificationConfig): ClientProviderOptions => ({
          name: USER_SERVICE_GRPC_CLIENT,
          transport: Transport.GRPC,
          options: {
            package: INCTAGRAM_USER_V1_PACKAGE_NAME,
            protoPath: join(process.cwd(), 'libs/contracts/src/proto/user.proto'),
            url: config.gatewayServiceGrpcUrl,
          },
        }),
      },
    ]),
  ],
  providers: [
    UserGrpcClient,
    UserGrpcAdapter,
    {
      provide: IUserGrpcAdapter,
      useExisting: UserGrpcAdapter,
    },
    {
      provide: NotificationRecipientContextPort,
      useExisting: UserGrpcAdapter,
    },
  ],
  exports: [IUserGrpcAdapter, NotificationRecipientContextPort],
})
export class UserGrpcClientModule {}
