export const AuthTokenType = {
  ACCESS: 'ACCESS',
  REFRESH: 'REFRESH',
} as const;

export type AuthTokenType = (typeof AuthTokenType)[keyof typeof AuthTokenType];

export interface TokenPayload {
  userId: string;
  deviceId: string;
  tokenType: AuthTokenType;
  iat: number;
  exp: number;
}

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export abstract class IJwtService {
  abstract createTokens(userId: string, deviceId: string): AuthTokens;

  abstract getPayload(token: string): Promise<TokenPayload | null>;

  abstract verifyAccessToken(token: string): TokenPayload;

  abstract verifyRefreshToken(token: string): TokenPayload;
}
