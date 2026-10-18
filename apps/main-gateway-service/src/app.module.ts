import { DynamicModule, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { GatewayConfig } from './core/gateway.config';
import { CoreModule } from '../../../libs/common/src/core.module';
import { CommonModule } from '../../../libs/common/src';
import { GatewayConfigModule } from './core/gateway-config.module';
import { GatewayController } from './modules/testing/api/gateway.controller';
import { FilesHttpClient } from './modules/testing/infrastructure/files-http.client';
import { PrismaModule } from './core/prisma/prisma.module';
import { PrismaTestController } from './modules/testing/api/prisma-test.controller';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { GoogleRecaptchaModule } from '@nestlab/google-recaptcha';
import { CoreConfig } from '../../../libs/common/src/core.config';
import { PostsModule } from './modules/posts/posts.module';
import { FilesModule } from './modules/files/files.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PaymentRabbitConsumer } from './modules/users/infrastructure/payment.rabbit.consumer';
import { GatewayRabbitMqModule } from './core/gateway-rabbitmq.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { NotificationsController } from './modules/notifications/api/notifications.controller';
import { NotificationLiveEventConsumer } from './modules/notifications/infrastructure/notification-live-event.consumer';
import { NotificationLiveEventPublisher } from './modules/notifications/infrastructure/notification-live-event.publisher';
import { SuperadminModule } from './modules/superadmin/superadmin.module';
import { SuperadminAuthModule } from './modules/superadmin/superadmin-auth.module';
import { SessionAdminPrincipalVerifier } from './modules/superadmin/infrastructure/session-admin-principal.verifier';
import { AdminPrincipalVerifier } from './modules/superadmin/domain/admin-principal';
import { SUPERADMIN_RUNTIME_TYPE_DEFS } from '../../../libs/contracts/src/graphql/superadmin/v1/runtime-type-defs';
import { SuperadminUsersModule } from './modules/superadmin/superadmin-users.module';
import { SuperadminModerationModule } from './modules/superadmin/superadmin-moderation.module';
import { UserAccessModule } from './modules/sessions/user-access.module';
import { UserAccessRevokedConsumer } from './modules/notifications/infrastructure/user-access-revoked.consumer';
import { UserAccessRevokeRelay } from './modules/users/infrastructure/outbox/user-access-revoke-relay';

@Module({
  imports: [
    CommonModule,
    UserAccessModule,
    SuperadminModule.withRuntime({
      typeDefs: SUPERADMIN_RUNTIME_TYPE_DEFS,
      production: process.env.NODE_ENV === 'production',
      imports: [SuperadminAuthModule, SuperadminUsersModule, SuperadminModerationModule],
      principalVerifier: {
        provide: AdminPrincipalVerifier,
        useExisting: SessionAdminPrincipalVerifier,
      },
    }),
    CoreModule,
    GatewayConfigModule,
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    SessionsModule,
    PostsModule,
    FilesModule,
    PaymentsModule,
    NotificationsModule,
    GoogleRecaptchaModule.forRootAsync({
      inject: [GatewayConfig, CoreConfig],
      useFactory: (config: GatewayConfig, coreConfig: CoreConfig) => {
        return {
          secretKey: config.recaptchaSecret,
          response: (req) => req.headers.recaptcha,
          skipIf: coreConfig.env !== 'production',
        };
      },
    }),
  ],
  controllers: [GatewayController, PrismaTestController],
  providers: [FilesHttpClient],
})
export class AppModule {
  // лучше чтобы все инфраструктурные подключения
  // (RabbitMQ, gRPC и т.д.) находились только внутри forRoot()
  static forRoot(config: GatewayConfig): DynamicModule {
    console.log('TestingModule connected?', config.includeTestingModule);

    return {
      module: AppModule,
      imports: [GatewayRabbitMqModule.forRoot(config)],
      controllers: [GatewayController, NotificationsController],
      providers: [
        FilesHttpClient,
        PaymentRabbitConsumer,
        NotificationLiveEventPublisher,
        NotificationLiveEventConsumer,
        UserAccessRevokedConsumer,
        UserAccessRevokeRelay,
      ],
    };
  }
}
