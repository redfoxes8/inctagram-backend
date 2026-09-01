import { Injectable } from '@nestjs/common';
import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { DomainException } from '../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../libs/common/src/exceptions/domain-exception-codes';
import { IUsersRepository } from '../../modules/users/domain/interfaces/users.repository.interface';
import { UserEntity } from '../../modules/users/domain/user.entity';
import { IPasswordService } from '../../modules/users/application/interfaces/password.service.interface';
import { CurrentUserInfo } from '../../../../../libs/common/types/auth.types';
import { ProfileEntity } from '../../modules/users/domain/profile.entity';
import { IProfileRepository } from '../../modules/users/domain/interfaces/user-profile.repository.interface';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(
    private userRepository: IUsersRepository,
    private passwordService: IPasswordService,
    private userProfileRepository: IProfileRepository,
  ) {
    super({
      usernameField: 'usernameOrEmail',
    });
  }

  async validate(usernameOrEmail: string, password: string): Promise<CurrentUserInfo> {
    let user: UserEntity;

    const userByEmail: UserEntity | null = await this.userRepository.findByEmail(usernameOrEmail);

    if (userByEmail) {
      user = userByEmail;
    } else {
      const userByUsername: ProfileEntity | null =
        await this.userProfileRepository.findByUsername(usernameOrEmail);

      if (userByUsername) {
        const userEntity: UserEntity | null = await this.userRepository.findById(
          userByUsername.userId,
        );
        user = userEntity!;
      } else {
        throw new DomainException({
          code: DomainExceptionCode.Unauthorized,
          message: 'Invalid credentials',
        });
      }
    }

    if (user.passwordHash === null) {
      throw new DomainException({
        code: DomainExceptionCode.Unauthorized,
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
