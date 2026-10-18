import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../core/prisma/prisma.module';
import {
  AdminCredentials,
  AdminLoginRateLimiter,
  AdminSessionRepository,
} from './domain/admin-session.repository';
import { AdminClock } from './domain/admin-clock';
import { SystemAdminClock } from './infrastructure/system-admin-clock';
import { AdminAuthConfig } from './infrastructure/admin-auth.config';
import { ConfiguredAdminCredentials } from './infrastructure/configured-admin-credentials';
import { PrismaAdminSessionRepository } from './infrastructure/prisma-admin-session.repository';
import { PrismaAdminLoginRateLimiter } from './infrastructure/prisma-admin-login-rate-limiter';
import { SessionAdminPrincipalVerifier } from './infrastructure/session-admin-principal.verifier';
import { SuperadminLoginUseCase } from './application/superadmin-login.usecase';
import { SuperadminLogoutUseCase } from './application/superadmin-logout.usecase';
import { AdminSessionCookies } from './api/admin-session-cookies';
import { SuperadminAuthResolver } from './api/superadmin-auth.resolver';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [
    { provide: AdminClock, useClass: SystemAdminClock },
    AdminAuthConfig,
    { provide: AdminCredentials, useClass: ConfiguredAdminCredentials },
    { provide: AdminSessionRepository, useClass: PrismaAdminSessionRepository },
    { provide: AdminLoginRateLimiter, useClass: PrismaAdminLoginRateLimiter },
    SessionAdminPrincipalVerifier,
    SuperadminLoginUseCase,
    SuperadminLogoutUseCase,
    AdminSessionCookies,
    SuperadminAuthResolver,
  ],
  exports: [SessionAdminPrincipalVerifier],
})
export class SuperadminAuthModule {}
