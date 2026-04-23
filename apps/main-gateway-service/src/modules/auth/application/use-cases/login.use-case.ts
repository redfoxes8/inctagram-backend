import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { randomUUID } from 'crypto';
import { ISessionsRepository } from '../../../sessions/domain/interfaces/sessions.repository.interface';
import { SessionEntity } from '../../../sessions/domain/session.entity';
import { AuthTokens, IJwtService, TokenPayload } from '../interfaces/jwt.service.interface';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UserEntity } from '../../../users/domain/user.entity';
import { CurrentUserInfo } from '../../../../../../../libs/common/types/auth.types';
import { IUsersRepository } from '../../../users/domain/interfaces/users.repository.interface';

export type LoginMetadata = {
  ip: string;
  deviceName: string;
  deviceId: string;
};

export class LoginCommand {
  constructor(
    public userInfo: CurrentUserInfo,
    public metadata: LoginMetadata,
  ) {}
}

@CommandHandler(LoginCommand)
export class LoginUseCase implements ICommandHandler<LoginCommand, AuthTokens> {
  constructor(
    private sessionsRepository: ISessionsRepository,
    private jwtService: IJwtService,
    private userRepository: IUsersRepository,
  ) {}

  public async execute({ userInfo, metadata }: LoginCommand): Promise<AuthTokens> {
    const user: UserEntity | null = await this.userRepository.findById(userInfo.userId);
    if (!user) {
      throw new DomainException({ code: DomainExceptionCode.NotFound, message: 'User not found' });
    }
    const tokens: AuthTokens = await this.jwtService.createTokens(user.id, metadata.deviceId);
    const payload: TokenPayload | null = await this.jwtService.getPayload(tokens.refreshToken);

    if (!payload) {
      throw new DomainException({
        code: DomainExceptionCode.InternalServerError,
        message: 'Refresh token payload is invalid',
      });
    }

    const session = new SessionEntity({
      id: randomUUID(),
      userId: user.id,
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
}
