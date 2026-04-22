import { Injectable } from '@nestjs/common';
import { AuthTokens, IJwtService, TokenPayload } from '../application/interfaces/jwt.service.interface';

@Injectable()
export class JwtServiceImplementation implements IJwtService {
  public async createTokens(userId: string, deviceId: string): Promise<AuthTokens> {
    void userId;
    void deviceId;
    throw new Error('JwtServiceImplementation is not implemented yet');
  }

  public async getPayload(token: string): Promise<TokenPayload | null> {
    void token;
    throw new Error('JwtServiceImplementation is not implemented yet');
  }
}
