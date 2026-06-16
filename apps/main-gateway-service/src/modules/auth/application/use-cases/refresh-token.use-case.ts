import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UnauthorizedException } from '@nestjs/common';
import { IJwtService, AuthTokens } from '../interfaces/jwt.service.interface';
import { ISessionsRepository } from '../../../sessions/domain/interfaces/sessions.repository.interface';

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
    // 1. Валидация токена
    let payload;
    try {
      payload = this.jwtService.verify(refreshToken);
    } catch (e) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!payload) {
      throw new UnauthorizedException('Invalid refresh token payload');
    }

    // 2. Поиск сессии для Rich Domain Model
    const session = await this.sessionsRepository.findByDeviceId(payload.deviceId);
    if (!session) {
      throw new UnauthorizedException('Session not found');
    }

    // 3. Генерация новых токенов
    const newTokens = this.jwtService.createTokens(payload.userId, payload.deviceId);
    const newPayload = await this.jwtService.getPayload(newTokens.refreshToken);

    if (!newPayload) {
      throw new UnauthorizedException('Failed to generate new token payload');
    }

    // 4. Обновление состояния сущности (Rich Domain Model)
    session.updateSessionDate(newPayload.iat, newPayload.exp);

    // 5. Атомарное обновление в БД с проверкой iat (защита от гонки и повторного использования)
    const isUpdated = await this.sessionsRepository.updateSessionAtomic(
      payload.deviceId,
      payload.iat, // Ожидаем iat из старого токена
      session.iat, // Новый iat из сущности
      session.exp, // Новый exp из сущности
    );

    // 6. Token Reuse Detection
    if (!isUpdated) {
      // Если токен валиден, но iat не совпал -> токен был украден/использован повторно
      // Отзываем сессию (удаляем ее)
      await this.sessionsRepository.deleteByDeviceId(payload.deviceId);
      
      throw new UnauthorizedException('Token reuse detected. Session revoked.');
    }

    return newTokens;
  }
}
