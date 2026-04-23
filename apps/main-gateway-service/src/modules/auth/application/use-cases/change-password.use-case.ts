import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { IUsersRepository } from '../../../users/domain/interfaces/users.repository.interface';
import { IPasswordService } from '../../../users/application/interfaces/password.service.interface';
import { ISessionsRepository } from '../../../sessions/domain/interfaces/sessions.repository.interface';
import { IPasswordRecoveryRepository } from '../../domain/interfaces/password-recovery.repository.interface';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ChangePasswordDTO } from '../../api/dto/change-password.dto';
import { PasswordRecoveryEntity } from '../../domain/password-recovery.entity';
import { UserEntity } from '../../../users/domain/user.entity';
import { JwtService } from '@nestjs/jwt';

export class ChangePasswordCommand {
  constructor(public dto: ChangePasswordDTO) {}
}

@CommandHandler(ChangePasswordCommand)
export class ChangePasswordUseCase implements ICommandHandler<ChangePasswordCommand, void> {
  constructor(
    private usersRepository: IUsersRepository,
    private passwordService: IPasswordService,
    private sessionsRepository: ISessionsRepository,
    private passwordRecoveryRepository: IPasswordRecoveryRepository,
  ) {}

  public async execute({ dto }: ChangePasswordCommand): Promise<void> {
    const recovery: PasswordRecoveryEntity | null =
      await this.passwordRecoveryRepository.findByCode(dto.recoveryCode);
    if (!recovery) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Invalid recovery data',
      });
    }

    recovery.markAsUsed();

    const user: UserEntity | null = await this.usersRepository.findById(recovery.userId);
    if (!user) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Invalid recovery data',
      });
    }

    const passwordHash = await this.passwordService.hashPassword(dto.newPassword);
    user.updateCredentials({
      username: user.username,
      email: user.email,
      passwordHash,
    });

    try {
      await this.usersRepository.update(user);
      await this.passwordRecoveryRepository.update(recovery);
      await this.sessionsRepository.deleteAllByUserId(user.id);
    } catch (e) {
      throw new DomainException({ code: DomainExceptionCode.InternalServerError, message: `${e}` });
    }
  }
}
