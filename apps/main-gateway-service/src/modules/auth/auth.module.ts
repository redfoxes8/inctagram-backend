import { Module } from '@nestjs/common';
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
import { IEmailAdapter } from './application/interfaces/email.adapter.interface';
import { EmailAdapterImplementation } from './infrastructure/email.adapter';
import { PassportModule } from '@nestjs/passport';
import { LocalStrategy } from '../../common/strategies/local.strategy';
import { ChangePasswordUseCase } from './application/use-cases/change-password.use-case';
import { JwtStrategy } from '../../common/strategies/jwt.strategy';
import { LogoutUseCase } from './application/use-cases/logout.use-case';
import { JwtModule } from '@nestjs/jwt';
import { GatewayConfig } from '../../core/gateway.config';

const useCases = [
  RegisterUserUseCase,
  LoginUseCase,
  PasswordRecoveryUseCase,
  ChangePasswordUseCase,
  ConfirmEmailUseCase,
  LogoutUseCase,
];
@Module({
  imports: [
    UsersModule,
    SessionsModule,
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
    { provide: IEmailAdapter, useClass: EmailAdapterImplementation },
    { provide: IEmailConfirmationRepository, useClass: EmailConfirmationRepositoryImplementation },
    { provide: IPasswordRecoveryRepository, useClass: PasswordRecoveryRepositoryImplementation },
  ],
})
export class AuthModule {}
