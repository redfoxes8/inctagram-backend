import { Injectable } from '@nestjs/common';
import {
  AuthTokenType,
  AuthTokens,
  IJwtService,
  TokenPayload,
} from '../application/interfaces/jwt.service.interface';
import { JwtService } from '@nestjs/jwt';
import { GatewayConfig } from '../../../core/gateway.config';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';

@Injectable()
export class JwtServiceImplementation implements IJwtService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: GatewayConfig,
  ) {}

  public createTokens(userId: string, deviceId: string): AuthTokens {
    const accessToken: string = this.jwtService.sign(
      { userId, deviceId, tokenType: AuthTokenType.ACCESS },
      {
        expiresIn: this.config.accessTokenExpTime,
      },
    );

    const refreshToken: string = this.jwtService.sign(
      { userId, deviceId, tokenType: AuthTokenType.REFRESH },
      {
        expiresIn: this.config.refreshTokenExpTime,
      },
    );

    return { accessToken, refreshToken };
  }

  public getPayload(token: string): Promise<TokenPayload | null> {
    return this.jwtService.decode(token);
  }

  public verifyAccessToken(token: string): TokenPayload {
    return this.verifyTokenType(token, AuthTokenType.ACCESS);
  }

  public verifyRefreshToken(token: string): TokenPayload {
    return this.verifyTokenType(token, AuthTokenType.REFRESH);
  }

  private verifyTokenType(token: string, tokenType: AuthTokenType): TokenPayload {
    try {
      const payload = this.jwtService.verify<TokenPayload>(token);
      if (!this.isPayloadOfType(payload, tokenType)) {
        throw new Error('JWT token type is invalid');
      }
      return payload;
    } catch {
      throw new DomainException({
        code: DomainExceptionCode.Unauthorized,
        message: 'Unauthorized',
      });
    }
  }

  private isPayloadOfType(payload: TokenPayload, tokenType: AuthTokenType): boolean {
    return (
      typeof payload.userId === 'string' &&
      payload.userId.length > 0 &&
      typeof payload.deviceId === 'string' &&
      payload.deviceId.length > 0 &&
      payload.tokenType === tokenType
    );
  }
}
