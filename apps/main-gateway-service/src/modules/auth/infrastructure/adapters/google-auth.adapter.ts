import { Injectable } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { GatewayConfig } from '../../../../core/gateway.config';
import {
  GoogleProfile,
  IGoogleAuthAdapter,
} from '../../application/interfaces/google-auth.adapter.interface';
import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';

@Injectable()
export class GoogleAuthAdapter implements IGoogleAuthAdapter {
  private readonly client: OAuth2Client;

  constructor(private readonly config: GatewayConfig) {
    this.client = new OAuth2Client(
      this.config.googleClientId,
      this.config.googleClientSecret,
      this.config.googleRedirectUri,
    );
  }

  public async exchangeCodeForProfile(code: string, redirectUri?: string): Promise<GoogleProfile> {
    try {
      // 1. Exchange code for tokens
      const { tokens } = await this.client.getToken({
        code,
        redirect_uri: redirectUri || this.config.googleRedirectUri,
      });

      // 2. Verify id_token
      const ticket = await this.client.verifyIdToken({
        idToken: tokens.id_token!,
        audience: this.config.googleClientId,
      });

      const payload = ticket.getPayload();

      if (!payload) {
        throw new DomainException({
          code: DomainExceptionCode.Unauthorized,
          message: 'Failed to extract Google profile payload',
        });
      }

      return {
        email: payload.email!,
        sub: payload.sub,
        name: payload.name,
        email_verified: payload.email_verified || false,
      };
    } catch (error: unknown) {
      console.error('Google OAuth Exchange Error:', error);
      throw new DomainException({
        code: DomainExceptionCode.Unauthorized,
        message: 'Invalid Google authorization code or token',
      });
    }
  }
}
