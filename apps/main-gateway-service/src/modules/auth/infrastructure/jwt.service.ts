import { Injectable } from '@nestjs/common';
import {
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
    private jwtService: JwtService,
    private config: GatewayConfig,
  ) { }
  
  public createTokens(userId: string, deviceId: string): AuthTokens {
    const accessToken: string = this.jwtService.sign(
      { userId: userId, deviceId: deviceId },
      {
        expiresIn: this.config.accessTokenExpTime,
      },
    );

    const refreshToken: string = this.jwtService.sign(
      { userId: userId, deviceId: deviceId },
      {
        expiresIn: this.config.refreshTokenExpTime,
      },
    );
    
    return {
      accessToken: accessToken,
      refreshToken: refreshToken,
    };
  }

  public getPayload(token: string): Promise<TokenPayload | null> {
    return this.jwtService.decode(token);
  }

  public verify(token: string): TokenPayload {
    try {
      return this.jwtService.verify(token);
    } catch (e) {
      console.log(e);
      throw new DomainException({
        code: DomainExceptionCode.Unauthorized,
        message: 'Unauthorized',
      });
    }
  }
}
