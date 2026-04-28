import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { UsersModule } from '../users/users.module';
import { SessionsModule } from '../sessions/sessions.module';
import { RegisterUserUseCase } from './application/use-cases/register-user.use-case';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { PasswordRecoveryUseCase } from './application/use-cases/password-recovery.use-case';
import { ConfirmEmailUseCase } from './application/use-cases/confirm-email.use-case';
import { AuthController } from './api/auth.controller';
import { IJwtService } from './application/interfaces/jwt.service.interface';
import { JwtServiceImplementation } from './infrastructure/jwt.service';
import { IEmailConfirmationRepository } from './domain/interfaces/email-confirmation.repository.interface';
import { IPasswordRecoveryRepository } from './domain/interfaces/password-recovery.repository.interface';
import { EmailConfirmationRepositoryImplementation } from './infrastructure/email-confirmation.repository';
import { PasswordRecoveryRepositoryImplementation } from './infrastructure/password-recovery.repository';
import { PassportModule } from '@nestjs/passport';
import { LocalStrategy } from '../../common/strategies/local.strategy';
import { ChangePasswordUseCase } from './application/use-cases/change-password.use-case';
import { JwtStrategy } from '../../common/strategies/jwt.strategy';
import { LogoutUseCase } from './application/use-cases/logout.use-case';
import { JwtModule } from '@nestjs/jwt';
import { GatewayConfig } from '../../core/gateway.config';
import { NotificationsModule } from '../notifications/notifications.module';
import { GoogleLoginUseCase } from './application/use-cases/google-login.use-case';
import { IGoogleAuthAdapter } from './application/interfaces/google-auth.adapter.interface';
import { GoogleAuthAdapter } from './infrastructure/adapters/google-auth.adapter';
import { IOAuthAccountsRepository } from './domain/interfaces/oauth-accounts.repository.interface';
import { PrismaOAuthAccountsRepository } from './infrastructure/oauth-accounts.repository';

const useCases = [
  RegisterUserUseCase,
  LoginUseCase,
  PasswordRecoveryUseCase,
  ChangePasswordUseCase,
  ConfirmEmailUseCase,
  LogoutUseCase,
  GoogleLoginUseCase,
];

@Module({
  imports: [
    CqrsModule,
    UsersModule,
    SessionsModule,
    NotificationsModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [GatewayConfig],
      useFactory: (config: GatewayConfig) => {
        return {
          secret: config.jwtSecret,
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    LocalStrategy,
    JwtStrategy,
    ...useCases,
    { provide: IJwtService, useClass: JwtServiceImplementation },
    { provide: IEmailConfirmationRepository, useClass: EmailConfirmationRepositoryImplementation },
    { provide: IPasswordRecoveryRepository, useClass: PasswordRecoveryRepositoryImplementation },
    { provide: IGoogleAuthAdapter, useClass: GoogleAuthAdapter },
    { provide: IOAuthAccountsRepository, useClass: PrismaOAuthAccountsRepository },
  ],
})
export class AuthModule {}
