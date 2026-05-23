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
import { CountUsersHandler } from './application/queries/count-users.query';

@Module({
  imports: [CqrsModule],
  controllers: [UsersController],
  providers: [
    CheckUsernameHandler,
    GetMeHandler,
    CountUsersHandler,
    { provide: IUsersRepository, useClass: PrismaUsersRepository },
    { provide: IUsersQueryRepository, useClass: PrismaUsersQueryRepository },
    { provide: IPasswordService, useClass: BcryptService },
  ],
  exports: [IUsersRepository, IUsersQueryRepository, IPasswordService],
})
export class UsersModule {}
