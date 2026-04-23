import { Module } from '@nestjs/common';
import { ISessionsRepository } from './domain/interfaces/sessions.repository.interface';
import { PrismaSessionsRepository } from './infrastructure/sessions.repository';
import { ISessionsQueryRepository } from './domain/interfaces/sessions.query-repository.interface';
import { PrismaSessionsQueryRepository } from './infrastructure/sessions.query-repository';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from '../../common/strategies/jwt.strategy';
import { DeactivateOneUseCase } from './application/use-cases/deactivate-one.use-case';
import { DeactivateAllUseCase } from './application/use-cases/deactivate-all.use-case';

const useCases = [DeactivateOneUseCase, DeactivateAllUseCase];
@Module({
  imports: [PassportModule],
  providers: [
    ...useCases,
    JwtStrategy,
    { provide: ISessionsRepository, useClass: PrismaSessionsRepository },
    { provide: ISessionsQueryRepository, useClass: PrismaSessionsQueryRepository },
  ],
  exports: [ISessionsRepository],
})
export class SessionsModule {}
