import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { SuperadminUsersQueryRepository } from '../users/domain/interfaces/superadmin-users.query-repository';
import { PrismaSuperadminUsersQueryRepository } from '../users/infrastructure/superadmin-users.query-repository';
import { GetSuperadminUsersQuery } from '../users/application/queries/get-superadmin-users.query';
import { GetSuperadminUserQuery } from '../users/application/queries/get-superadmin-user.query';
import { SuperadminUsersResolver } from './api/superadmin-users.resolver';

@Module({
  imports: [PrismaModule],
  providers: [
    { provide: SuperadminUsersQueryRepository, useClass: PrismaSuperadminUsersQueryRepository },
    GetSuperadminUsersQuery,
    GetSuperadminUserQuery,
    SuperadminUsersResolver,
  ],
})
export class SuperadminUsersModule {}
