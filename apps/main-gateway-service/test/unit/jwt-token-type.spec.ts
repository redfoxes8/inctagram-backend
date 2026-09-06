import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';

import { JwtStrategy } from '../../src/common/strategies/jwt.strategy';
import { GatewayConfig } from '../../src/core/gateway.config';
import {
  AuthTokenType,
  type IJwtService,
} from '../../src/modules/auth/application/interfaces/jwt.service.interface';
import {
  RefreshTokenCommand,
  RefreshTokenUseCase,
} from '../../src/modules/auth/application/use-cases/refresh-token.use-case';
import { JwtServiceImplementation } from '../../src/modules/auth/infrastructure/jwt.service';
import { SessionEntity } from '../../src/modules/sessions/domain/session.entity';
import { ISessionsRepository } from '../../src/modules/sessions/domain/interfaces/sessions.repository.interface';

const JWT_SECRET = 'test-jwt-secret';
const USER_ID = '10000000-0000-4000-8000-000000000001';
const DEVICE_ID = '20000000-0000-4000-8000-000000000001';

function createJwtService(): JwtServiceImplementation {
  return new JwtServiceImplementation(new JwtService({ secret: JWT_SECRET }), {
    jwtSecret: JWT_SECRET,
    accessTokenExpTime: 60,
    refreshTokenExpTime: 120,
  } as GatewayConfig);
}

function createSession(): SessionEntity {
  return new SessionEntity({
    id: '30000000-0000-4000-8000-000000000001',
    userId: USER_ID,
    deviceId: DEVICE_ID,
    deviceName: 'test-device',
    ip: '127.0.0.1',
    iat: 1,
    exp: 2,
    createdAt: new Date('2026-09-06T00:00:00.000Z'),
    updatedAt: new Date('2026-09-06T00:00:00.000Z'),
    deletedAt: null,
  });
}

describe('JWT token type hardening', () => {
  it('issues signed access and refresh types and accepts only access through the HTTP strategy', () => {
    const jwtService = createJwtService();
    const tokens = jwtService.createTokens(USER_ID, DEVICE_ID);
    const strategy = new JwtStrategy({ jwtSecret: JWT_SECRET } as GatewayConfig);

    const accessPayload = jwtService.verifyAccessToken(tokens.accessToken);
    const refreshPayload = jwtService.verifyRefreshToken(tokens.refreshToken);

    expect(accessPayload.tokenType).toBe(AuthTokenType.ACCESS);
    expect(refreshPayload.tokenType).toBe(AuthTokenType.REFRESH);
    expect(strategy.validate(accessPayload)).toEqual({ userId: USER_ID, deviceId: DEVICE_ID });
  });

  it('rejects refresh tokens through the access verification boundary used by HTTP and WebSocket', () => {
    const jwtService = createJwtService();
    const tokens = jwtService.createTokens(USER_ID, DEVICE_ID);
    const strategy = new JwtStrategy({ jwtSecret: JWT_SECRET } as GatewayConfig);

    expect(() => jwtService.verifyAccessToken(tokens.refreshToken)).toThrow('Unauthorized');
    expect(() => strategy.validate(jwtService.verifyRefreshToken(tokens.refreshToken))).toThrow(
      'Unauthorized',
    );
  });

  it('rejects legacy tokens without a signed token type claim', () => {
    const jwtService = createJwtService();
    const legacyToken = new JwtService({ secret: JWT_SECRET }).sign({
      userId: USER_ID,
      deviceId: DEVICE_ID,
    });

    expect(() => jwtService.verifyAccessToken(legacyToken)).toThrow('Unauthorized');
    expect(() => jwtService.verifyRefreshToken(legacyToken)).toThrow('Unauthorized');
  });

  it('allows refresh rotation only for refresh tokens', async () => {
    const jwtService = createJwtService();
    const tokens = jwtService.createTokens(USER_ID, DEVICE_ID);
    const sessionsRepository = {
      findByDeviceId: jest.fn().mockResolvedValue(createSession()),
      updateSessionAtomic: jest.fn().mockResolvedValue(true),
    } as unknown as ISessionsRepository;
    const useCase = new RefreshTokenUseCase(jwtService as IJwtService, sessionsRepository);

    await expect(
      useCase.execute(new RefreshTokenCommand(tokens.refreshToken)),
    ).resolves.toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    });
    await expect(
      useCase.execute(new RefreshTokenCommand(tokens.accessToken)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
