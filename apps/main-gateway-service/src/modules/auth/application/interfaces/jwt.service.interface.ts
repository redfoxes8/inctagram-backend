export interface TokenPayload {
  userId: string;
  deviceId: string;
  iat: number;
  exp: number;
}

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export abstract class IJwtService {
  abstract createTokens(userId: string, deviceId: string): Promise<AuthTokens>;

  abstract getPayload(token: string): Promise<TokenPayload | null>;
}
