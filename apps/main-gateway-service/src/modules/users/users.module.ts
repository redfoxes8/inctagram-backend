import { Module } from '@nestjs/common';
import { IUsersRepository } from './domain/interfaces/users.repository.interface';
import { PrismaUsersRepository } from './infrastructure/users.repository';
import { IPasswordService } from './application/interfaces/password.service.interface';
import { BcryptService } from './infrastructure/password.service';
import { IUsersQueryRepository } from './domain/interfaces/users.query-repository.interface';
import { PrismaUsersQueryRepository } from './infrastructure/users.query-repository';
import { CheckUsernameHandler } from './application/queries/check-username.query';
import { GetMeHandler } from './application/queries/get-me.query';
import { CqrsModule } from '@nestjs/cqrs';
import { UsersController } from './api/users.controller';
import { ProfileController } from './api/profile.controller';
import { CountUsersHandler } from './application/queries/count-users.query';
import { GetProfileHandler } from './application/queries/get-profile.query';
import { IProfileRepository } from './domain/interfaces/user-profile.repository.interface';
import { ProfileRepository } from './infrastructure/profile.repository';
import { IProfileQueryRepository } from './domain/interfaces/user-profile.query-repository.interface';
import { ProfileQueryRepository } from './infrastructure/profile.query-repository';
import { PostGrpcClientModule } from '../posts/infrastructure/post-grpc-client.module';
import { FileGrpcClientModule } from '../files/infrastructure/file-grpc-client.module';
import { ScheduleModule } from '@nestjs/schedule';
import { GetAvatarUploadUrlHandler } from './application/commands/get-avatar-upload-url.command';
import { ConfirmAvatarHandler } from './application/commands/confirm-avatar.command';
import { AvatarOutboxRelayCron } from './infrastructure/outbox/avatar-outbox-relay.cron';
import { IPostGrpcAdapter } from '../posts/infrastructure/interfaces/post-grpc-adapter.interface';
import { PostGrpcAdapter } from '../posts/infrastructure/post-grpc.adapter';
import { UpdateProfileUseCase } from './application/use-cases/update-profile.use-case';

const adapters = [
  {
    provide: IPostGrpcAdapter,
    useClass: PostGrpcAdapter,
  },
];
@Module({
  imports: [CqrsModule, PostGrpcClientModule, FileGrpcClientModule, ScheduleModule],
  controllers: [UsersController, ProfileController],
  providers: [
    CheckUsernameHandler,
    GetMeHandler,
    CountUsersHandler,
    GetProfileHandler,
    UpdateProfileUseCase,
    GetPublicProfileHandler,
    GetAvatarUploadUrlHandler,
    ConfirmAvatarHandler,
    AvatarOutboxRelayCron,
    { provide: IUsersRepository, useClass: PrismaUsersRepository },
    { provide: IUsersQueryRepository, useClass: PrismaUsersQueryRepository },
    { provide: IProfileRepository, useClass: ProfileRepository },
    { provide: IProfileQueryRepository, useClass: ProfileQueryRepository },
    { provide: IPasswordService, useClass: BcryptService },
    ...adapters,
  ],
  exports: [
    IUsersRepository,
    IUsersQueryRepository,
    IProfileRepository,
    IProfileQueryRepository,
    IPasswordService,
  ],
})
export class UsersModule {}
