import { Module } from '@nestjs/common';
import { UserStateAuditModule } from '../users/user-state-audit.module';
import { UserAccessModule } from '../sessions/user-access.module';
import { UserModerationRepository } from '../users/domain/interfaces/user-moderation.repository';
import { PrismaUserModerationRepository } from '../users/infrastructure/user-moderation.repository';
import { ModerateUserUseCase } from '../users/application/commands/moderate-user.usecase';
import { SuperadminModerationResolver } from './api/superadmin-moderation.resolver';

@Module({
  imports: [UserStateAuditModule, UserAccessModule],
  providers: [
    { provide: UserModerationRepository, useClass: PrismaUserModerationRepository },
    ModerateUserUseCase,
    SuperadminModerationResolver,
  ],
  exports: [ModerateUserUseCase],
})
export class SuperadminModerationModule {}
