import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { PasswordRecoveryDto } from '../../api/dto/password-recovery.dto';
import { IUsersRepository } from '../../../users/domain/interfaces/users.repository.interface';
import { IPasswordService } from '../../../users/application/interfaces/password.service.interface';
import { ISessionsRepository } from '../../../sessions/domain/interfaces/sessions.repository.interface';
import { IPasswordRecoveryRepository } from '../../domain/interfaces/password-recovery.repository.interface';

export class PasswordRecoveryUseCase {
  constructor(
    private usersRepository: IUsersRepository,
    private passwordService: IPasswordService,
    private sessionsRepository: ISessionsRepository,
    private passwordRecoveryRepository: IPasswordRecoveryRepository,
  ) {}

  public async execute(dto: PasswordRecoveryDto): Promise<void> {
    const user = await this.usersRepository.findByEmail(dto.email);
    if (!user || !user.id) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Invalid recovery data',
      });
    }

    const recovery = await this.passwordRecoveryRepository.findByUserIdAndCode(
      user.id,
      dto.recoveryCode,
    );

    if (!recovery) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Invalid recovery data',
      });
    }

    recovery.markAsUsed();

    const passwordHash = await this.passwordService.hashPassword(dto.newPassword);
    user.updateCredentials({
      username: user.username,
      email: user.email,
      passwordHash,
    });

    await this.usersRepository.update(user);
    await this.passwordRecoveryRepository.update(recovery);
    await this.sessionsRepository.deleteAllByUserId(user.id);
  }
}
