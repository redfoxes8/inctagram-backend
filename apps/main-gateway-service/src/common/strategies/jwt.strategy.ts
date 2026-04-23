import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { GatewayConfig } from '../../core/gateway.config';
import { TokenPayload } from '../../modules/auth/application/interfaces/jwt.service.interface';
import { CurrentUserInfo } from '../../../../../libs/common/types/auth.types';

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
    return {
      userId: payload.userId,
      deviceId: payload.deviceId,
    };
  }
}
