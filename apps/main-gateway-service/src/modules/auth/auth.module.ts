import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { UsersModule } from '../users/users.module';
import { SessionsModule } from '../sessions/sessions.module';
import { RegisterUserUseCase } from './application/use-cases/register-user.use-case';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { PasswordRecoveryUseCase } from './application/use-cases/password-recovery.use-case';
import { ConfirmEmailUseCase } from './application/use-cases/confirm-email.use-case';
import { AuthEmailResendConfirmationUseCase } from './application/use-cases/auth-email-resend-confirmation.usecase';
import { RefreshTokenUseCase } from './application/use-cases/refresh-token.use-case';
import { AuthController } from './api/auth.controller';
import { IEmailConfirmationRepository } from './domain/interfaces/email-confirmation.repository.interface';
import { IPasswordRecoveryRepository } from './domain/interfaces/password-recovery.repository.interface';
import { EmailConfirmationRepositoryImplementation } from './infrastructure/email-confirmation.repository';
import { PasswordRecoveryRepositoryImplementation } from './infrastructure/password-recovery.repository';
import { PassportModule } from '@nestjs/passport';
import { LocalStrategy } from '../../common/strategies/local.strategy';
import { ChangePasswordUseCase } from './application/use-cases/change-password.use-case';
import { JwtStrategy } from '../../common/strategies/jwt.strategy';
import { LogoutUseCase } from './application/use-cases/logout.use-case';
import { NotificationsModule } from '../notifications/notifications.module';
import { GoogleLoginUseCase } from './application/use-cases/google-login.use-case';
import { IGoogleAuthAdapter } from './application/interfaces/google-auth.adapter.interface';
import { GoogleAuthAdapter } from './infrastructure/adapters/google-auth.adapter';
import { IOAuthAccountsRepository } from './domain/interfaces/oauth-accounts.repository.interface';
import { PrismaOAuthAccountsRepository } from './infrastructure/oauth-accounts.repository';
import { PrismaTransactionManager } from '../../core/prisma/transactions/prisma.transaction.manager';
import { ITransactionManager } from '../../common/interfaces/transaction-manager.interface';
import { AuthTokenModule } from './auth-token.module';

const useCases = [
  RegisterUserUseCase,
  LoginUseCase,
  PasswordRecoveryUseCase,
  ChangePasswordUseCase,
  ConfirmEmailUseCase,
  LogoutUseCase,
  GoogleLoginUseCase,
  AuthEmailResendConfirmationUseCase,
  RefreshTokenUseCase,
];

const repositories = [
  { provide: IOAuthAccountsRepository, useClass: PrismaOAuthAccountsRepository },
  { provide: IEmailConfirmationRepository, useClass: EmailConfirmationRepositoryImplementation },
  { provide: IPasswordRecoveryRepository, useClass: PasswordRecoveryRepositoryImplementation },
];

const managers = [{ provide: ITransactionManager, useClass: PrismaTransactionManager }];

@Module({
  imports: [
    CqrsModule,
    UsersModule,
    SessionsModule,
    NotificationsModule,
    PassportModule,
    AuthTokenModule,
  ],
  controllers: [AuthController],
  providers: [
    LocalStrategy,
    JwtStrategy,
    ...useCases,
    { provide: IGoogleAuthAdapter, useClass: GoogleAuthAdapter },
    ...repositories,
    ...managers,
  ],
})
export class AuthModule {}
