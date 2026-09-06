import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { GatewayConfig } from '../../core/gateway.config';
import {
  AuthTokenType,
  TokenPayload,
} from '../../modules/auth/application/interfaces/jwt.service.interface';
import { CurrentUserInfo } from '../../../../../libs/common/types/auth.types';
import { DomainException } from '../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../libs/common/src/exceptions/domain-exception-codes';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private config: GatewayConfig) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.jwtSecret,
    });
  }

  validate(payload: TokenPayload): CurrentUserInfo {
    if (payload.tokenType !== AuthTokenType.ACCESS) {
      throw new DomainException({
        code: DomainExceptionCode.Unauthorized,
        message: 'Unauthorized',
      });
    }
    return {
      userId: payload.userId,
      deviceId: payload.deviceId,
    };
  }
}
