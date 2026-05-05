import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { IGoogleAuthAdapter } from '../interfaces/google-auth.adapter.interface';
import { IOAuthAccountsRepository } from '../../domain/interfaces/oauth-accounts.repository.interface';
import { IUsersRepository } from '../../../users/domain/interfaces/users.repository.interface';
import { IJwtService, AuthTokens, TokenPayload } from '../interfaces/jwt.service.interface';
import { ISessionsRepository } from '../../../sessions/domain/interfaces/sessions.repository.interface';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { UserEntity } from '../../../users/domain/user.entity';
import { randomUUID } from 'crypto';
import { SessionEntity } from '../../../sessions/domain/session.entity';
import { LoginMetadata } from './login.use-case';


export class GoogleLoginCommand {
  constructor(
    public readonly authCode: string,
    public readonly username: string | undefined,
    public readonly metadata: LoginMetadata,
    public readonly redirectUri?: string,
  ) {}
}

@CommandHandler(GoogleLoginCommand)
export class GoogleLoginUseCase implements ICommandHandler<GoogleLoginCommand, AuthTokens> {
  constructor(
    private readonly googleAuthAdapter: IGoogleAuthAdapter,
    private readonly oauthAccountsRepository: IOAuthAccountsRepository,
    private readonly usersRepository: IUsersRepository,
    private readonly sessionsRepository: ISessionsRepository,
    private readonly jwtService: IJwtService,
    private readonly prisma: PrismaService,
  ) {}

  async execute(command: GoogleLoginCommand): Promise<AuthTokens> {
    const { authCode, username, metadata, redirectUri } = command;

    // Step A: Exchange code for profile
    const profile = await this.googleAuthAdapter.exchangeCodeForProfile(authCode, redirectUri);

    // Step B: Security Check
    if (!profile.email_verified) {
      throw new DomainException({
        code: DomainExceptionCode.Unauthorized,
        message: 'Google email is not verified',
      });
    }

    // Step C: Lookup in OAuthAccountRepository
    const oauthAccount = await this.oauthAccountsRepository.findByProviderId('google', profile.sub);
    let userId: string;

    if (oauthAccount) {
      userId = oauthAccount.userId;
      const user = await this.usersRepository.findById(userId);
      if (user && user.email !== profile.email) {
        user.email = profile.email;
        await this.usersRepository.update(user);
      }
    } else {
      // Step D: Account Linking or New User
      const existingUser = await this.usersRepository.findByEmail(profile.email);

      if (existingUser) {
        // Account Linking
        userId = existingUser.id;
        await this.oauthAccountsRepository.create({
          userId: userId,
          provider: 'google',
          providerId: profile.sub,
        });
      } else {
        // Step E: New User (with Transaction)
        userId = await this.prisma.$transaction(async (tx) => {
          // Generate unique username
          const finalUsername = await this.generateUniqueUsername(username || profile.email.split('@')[0]);

          const newUser = new UserEntity({
            id: randomUUID(),
            username: finalUsername,
            email: profile.email,
            passwordHash: null,
            isConfirmed: true,
          });

          const createdUser = await this.usersRepository.save(newUser, tx);
          await this.oauthAccountsRepository.create(
            {
              userId: createdUser.id,
              provider: 'google',
              providerId: profile.sub,
            },
            tx,
          );

          return createdUser.id;
        });
      }
    }

    // Step F: Create Session and Tokens (same as LoginUseCase)
    const tokens: AuthTokens = this.jwtService.createTokens(userId, metadata.deviceId);
    const payload: TokenPayload | null = await this.jwtService.getPayload(tokens.refreshToken);

    if (!payload) {
      throw new DomainException({
        code: DomainExceptionCode.InternalServerError,
        message: 'Refresh token payload is invalid',
      });
    }

    const session = new SessionEntity({
      id: randomUUID(),
      userId: userId,
      deviceId: metadata.deviceId,
      deviceName: metadata.deviceName,
      ip: metadata.ip,
      iat: payload.iat,
      exp: payload.exp,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    await this.sessionsRepository.save(session);
    return tokens;
  }

  private async generateUniqueUsername(baseUsername: string): Promise<string> {
    let username = baseUsername;
    let isAvailable = await this.checkUsernameAvailability(username);
    let attempts = 0;

    while (!isAvailable && attempts < 10) {
      const suffix = Math.floor(1000 + Math.random() * 9000);
      username = `${baseUsername}${suffix}`;
      isAvailable = await this.checkUsernameAvailability(username);
      attempts++;
    }

    if (!isAvailable) {
      // Fallback to timestamp if still not available
      username = `${baseUsername}${Date.now()}`;
    }

    return username;
  }

  private async checkUsernameAvailability(username: string): Promise<boolean> {
    const user = await this.prisma.user.findFirst({
      where: {
        username: username,
        deletedAt: null,
      },
    });
    return !user;
  }
}
