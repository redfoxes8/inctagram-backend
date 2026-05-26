import { DynamicModule, Module } from '@nestjs/common';
import { ClientsModule, Transport, ClientProviderOptions } from '@nestjs/microservices';
import { join } from 'path';

import { CoreModule } from '../../../libs/common/src/core.module';

import { FilesConfig } from './core/files.config';
import { FilesConfigModule } from './core/files-config.module';
import { PrismaModule } from './core/prisma/prisma.module';
import { FilesModule } from './modules/files/files.module';
import { CronModule } from './modules/cron/cron.module';
import { FilesController as TestingFilesController } from './modules/testing/api/files.controller';
import { INCTAGRAM_POST_V1_PACKAGE_NAME } from '../../../libs/contracts/src';
import { FILES_EVENT_CLIENT } from './modules/files/file-event.constants';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';

@Module({
  imports: [CoreModule, FilesConfigModule, PrismaModule, FilesModule, CronModule],
  controllers: [],
})
export class AppModule {
  static forRoot(config: FilesConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ClientsModule.register([
          {
            name: 'POST_SERVICE_PACKAGE',
            transport: Transport.GRPC,
            options: {
              package: INCTAGRAM_POST_V1_PACKAGE_NAME,
              protoPath: join(process.cwd(), 'libs/contracts/src/proto/post.proto'),
              url: config.postServiceGrpcUrl,
            },
          },
          {
            name: FILES_EVENT_CLIENT,
            transport: Transport.RMQ,
            options: {
              urls: [config.rabbitmqUrl],
              queue: config.filesEventsQueue,
              noAck: false,
              queueOptions: {
                durable: true,
              },
            },
          } as ClientProviderOptions,
        ]),
        RabbitMQModule.forRoot({
          exchanges: [
            {
              name: 'common_exchange',
              type: 'topic',
            },
          ],
          uri: config.rabbitmqUrl,
          connectionInitOptions: { wait: false },
          queues: [
            {
              name: 'files_queue',
              options: {
                durable: true,
                arguments: {
                  'x-dead-letter-exchange': 'dlx.common_exchange',
                },
              },
            },
          ],
        }),
      ],
      controllers: [TestingFilesController],
    };
  }
}
