import { Module } from '@nestjs/common';
import { IUsersRepository } from './domain/interfaces/users.repository.interface';
import { PrismaUserRepository } from './infrastructure/users.repository';
import { IPasswordService } from './application/interfaces/password.service.interface';
import { BcryptService } from './infrastructure/password.service'; // Предположим, реализация тут

@Module({
  providers: [
    { provide: IUsersRepository, useClass: PrismaUserRepository },
    { provide: IPasswordService, useClass: BcryptService },
  ],
  exports: [IUsersRepository, IPasswordService], // Экспортируем для AuthModule
})
export class UsersModule {}
