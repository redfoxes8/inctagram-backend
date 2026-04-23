import { Module } from '@nestjs/common';
import { ISessionsRepository } from './domain/interfaces/sessions.repository.interface';
import { PrismaSessionsRepository } from './infrastructure/sessions.repository';
import { ISessionsQueryRepository } from './domain/interfaces/sessions.query-repository.interface';
import { PrismaSessionsQueryRepository } from './infrastructure/sessions.query-repository';

@Module({
  providers: [
    { provide: ISessionsRepository, useClass: PrismaSessionsRepository },
    { provide: ISessionsQueryRepository, useClass: PrismaSessionsQueryRepository },
  ],
  exports: [ISessionsRepository, ISessionsQueryRepository],
})
export class SessionsModule {}
