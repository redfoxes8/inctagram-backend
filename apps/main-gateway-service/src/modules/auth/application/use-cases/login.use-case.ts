import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { randomUUID } from 'crypto';
import { LoginDto } from '../../api/dto/login.dto';
import { IUsersRepository } from '../../../users/domain/interfaces/users.repository.interface';
import { IPasswordService } from '../../../users/application/interfaces/password.service.interface';
import { ISessionsRepository } from '../../../sessions/domain/interfaces/sessions.repository.interface';
import { SessionEntity } from '../../../sessions/domain/session.entity';
import { AuthTokens, IJwtService } from '../interfaces/jwt.service.interface';

export type LoginMetadata = {
  ip: string;
  deviceName: string;
  deviceId: string;
};

export class LoginUseCase {
  constructor(
    private usersRepository: IUsersRepository,
    private passwordService: IPasswordService,
    private sessionsRepository: ISessionsRepository,
    private jwtService: IJwtService,
  ) {}

  public async execute(dto: LoginDto, metadata: LoginMetadata): Promise<AuthTokens> {
    const user = await this.usersRepository.findByUsernameOrEmail(dto.usernameOrEmail);
    if (!user) {
      throw new DomainException({
        code: DomainExceptionCode.Unauthorized,
        message: 'Invalid credentials',
      });
    }

    user.ensureConfirmed();

    const isPasswordCorrect = await this.passwordService.comparePassword(
      dto.password,
      user.passwordHash,
    );

    if (!isPasswordCorrect) {
      throw new DomainException({
        code: DomainExceptionCode.Unauthorized,
        message: 'Invalid credentials',
      });
    }

    const tokens = await this.jwtService.createTokens(user.id, metadata.deviceId);
    const payload = await this.jwtService.getPayload(tokens.refreshToken);

    if (!payload) {
      throw new DomainException({
        code: DomainExceptionCode.InternalServerError,
        message: 'Refresh token payload is invalid',
      });
    }

    const session = new SessionEntity({
      id: randomUUID(),
      userId: user.id,
      deviceId: metadata.deviceId,
      deviceName: metadata.deviceName,
      ip: metadata.ip,
      iat: payload.iat,
      exp: payload.exp,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    await this.sessionsRepository.save(session);
    return tokens;
  }
}
