import { Injectable } from '@nestjs/common';
import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { DomainException } from '../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../libs/common/src/exceptions/domain-exception-codes';
import { IUsersRepository } from '../../modules/users/domain/interfaces/users.repository.interface';
import { UserEntity } from '../../modules/users/domain/user.entity';
import { IPasswordService } from '../../modules/users/application/interfaces/password.service.interface';
import { CurrentUserInfo } from '../../../../../libs/common/types/auth.types';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(
    private userRepository: IUsersRepository,
    private passwordService: IPasswordService,
  ) {
    super({
      usernameField: 'usernameOrEmail',
    });
  }

  async validate(usernameOrEmail: string, password: string): Promise<CurrentUserInfo> {
    const user: UserEntity | null =
      await this.userRepository.findByUsernameOrEmail(usernameOrEmail);
    if (!user) {
      throw new DomainException({
        code: DomainExceptionCode.Unauthorized,
        message: 'Invalid credentials',
      });
    if (user.passwordHash === null) {
      throw new DomainException({
        code: DomainExceptionCode.OAuthProviderRequired,
        message: 'Please login using your OAuth provider (Google)',
      });
    }

    const isPasswordCorrect: boolean = await this.passwordService.comparePassword(
      password,
      user.passwordHash,
    );
    if (!isPasswordCorrect) {
      throw new DomainException({
        code: DomainExceptionCode.Unauthorized,
        message: 'Invalid credentials',
      });
    }

    user.ensureConfirmed();

    return { userId: user.id, deviceId: '' };
  }
}
