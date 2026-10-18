import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/prisma/prisma.module';
import {
  UserAccessCheck,
  UserAccessClock,
  UserAccessSessionQuery,
} from './application/user-access-check';
import { PrismaUserAccessSessionQuery } from './infrastructure/user-access-session.query';

@Module({
  imports: [PrismaModule],
  providers: [
    UserAccessCheck,
    UserAccessClock,
    { provide: UserAccessSessionQuery, useClass: PrismaUserAccessSessionQuery },
  ],
  exports: [UserAccessCheck, UserAccessClock],
})
export class UserAccessModule {}
