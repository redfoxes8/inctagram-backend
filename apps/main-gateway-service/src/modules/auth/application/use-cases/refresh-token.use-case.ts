import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { IJwtService, AuthTokens, TokenPayload } from '../interfaces/jwt.service.interface';
import { ISessionsRepository } from '../../../sessions/domain/interfaces/sessions.repository.interface';
import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';

export class RefreshTokenCommand {
  constructor(public readonly refreshToken: string) {}
}

@CommandHandler(RefreshTokenCommand)
export class RefreshTokenUseCase implements ICommandHandler<RefreshTokenCommand, AuthTokens> {
  constructor(
    private readonly jwtService: IJwtService,
    private readonly sessionsRepository: ISessionsRepository,
  ) {}

  async execute({ refreshToken }: RefreshTokenCommand): Promise<AuthTokens> {
    let payload: TokenPayload;
    try {
      payload = this.jwtService.verifyRefreshToken(refreshToken);
    } catch {
      throw this.denied();
    }
    const session = await this.sessionsRepository.findByUserIdAndDeviceId(
      payload.userId,
      payload.deviceId,
    );
    if (!session || session.exp <= Math.floor(Date.now() / 1000)) throw this.denied();
    const tokens = this.jwtService.createTokens(payload.userId, payload.deviceId);
    const renewed = await this.jwtService.getPayload(tokens.refreshToken);
    if (!renewed) throw this.denied();
    // State lock and ownership/iat check + write/reuse revoke share one DB transaction.
    const updated = await this.sessionsRepository.updateSessionAtomic({
      userId: payload.userId,
      deviceId: payload.deviceId,
      expectedIat: payload.iat,
      newIat: renewed.iat,
      newExp: renewed.exp,
    });
    if (!updated) throw this.denied();
    return tokens;
  }

  private denied(): DomainException {
    return new DomainException({ code: DomainExceptionCode.Unauthorized, message: 'Unauthorized' });
  }
}
