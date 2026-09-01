import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { GoogleProfile, IGoogleAuthAdapter } from '../interfaces/google-auth.adapter.interface';
import {
  IOAuthAccountsRepository,
  OAuthAccountData,
} from '../../domain/interfaces/oauth-accounts.repository.interface';
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
import { ProfileEntity } from '../../../users/domain/profile.entity';
import { IProfileRepository } from '../../../users/domain/interfaces/user-profile.repository.interface';

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
    private readonly profileRepository: IProfileRepository,
  ) {}

  async execute(command: GoogleLoginCommand): Promise<AuthTokens> {
    const { authCode, username, metadata, redirectUri } = command;

    // Step A: Exchange code for profile
    const googleProfile: GoogleProfile = await this.googleAuthAdapter.exchangeCodeForProfile(
      authCode,
      redirectUri,
    );

    // Step B: Security Check
    if (!googleProfile.email_verified) {
      throw new DomainException({
        code: DomainExceptionCode.Unauthorized,
        message: 'Google email is not verified',
      });
    }

    // Step C: Lookup in OAuthAccountRepository
    const oauthAccount: OAuthAccountData | null =
      await this.oauthAccountsRepository.findByProviderId('google', googleProfile.sub);
    let userId: string;

    if (oauthAccount) {
      userId = oauthAccount.userId;
      const user: UserEntity | null = await this.usersRepository.findById(userId);
      if (user && user.email !== googleProfile.email) {
        user.email = googleProfile.email;
        await this.usersRepository.update(user);
      }
    } else {
      // Step D: Account Linking or New User
      const existingUser: UserEntity | null = await this.usersRepository.findByEmail(
        googleProfile.email,
      );

      if (existingUser) {
        // Account Linking
        userId = existingUser.id;
        await this.oauthAccountsRepository.create({
          userId: userId,
          provider: 'google',
          providerId: googleProfile.sub,
        });
      } else {
        // Step E: New User (with Transaction)
        userId = await this.prisma.$transaction(async (tx): Promise<string> => {
          // Generate unique username
          const finalUsername: string = await this.generateUniqueUsername(
            username || googleProfile.email.split('@')[0],
          );

          const newUser: UserEntity = UserEntity.createNew(googleProfile.email, null);
          const newProfile: ProfileEntity = ProfileEntity.createNew(newUser.id, finalUsername);

          const createdUser: UserEntity = await this.usersRepository.save(newUser, tx);
          await this.profileRepository.save(newProfile, tx);

          await this.oauthAccountsRepository.create(
            {
              userId: createdUser.id,
              provider: 'google',
              providerId: googleProfile.sub,
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
    const user: ProfileEntity | null = await this.profileRepository.findByUsername(username);
    return !user;
  }
}
