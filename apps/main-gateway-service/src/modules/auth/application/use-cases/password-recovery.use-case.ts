import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { PasswordRecoveryDto } from '../../api/dto/password-recovery.dto';
import { IUsersRepository } from '../../../users/domain/interfaces/users.repository.interface';
import { IPasswordRecoveryRepository } from '../../domain/interfaces/password-recovery.repository.interface';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UserEntity } from '../../../users/domain/user.entity';
import { randomBytes, randomUUID } from 'crypto';
import { PasswordRecoveryEntity } from '../../domain/password-recovery.entity';
import { IEmailAdapter } from '../interfaces/email.adapter.interface';

export class PasswordRecoveryCommand {
  constructor(public dto: PasswordRecoveryDto) {}
}

@CommandHandler(PasswordRecoveryCommand)
export class PasswordRecoveryUseCase implements ICommandHandler<PasswordRecoveryCommand, void> {
  constructor(
    private usersRepository: IUsersRepository,
    private passwordRecoveryRepository: IPasswordRecoveryRepository,
    private emailAdapter: IEmailAdapter,
  ) {}

  public async execute({ dto }: PasswordRecoveryCommand): Promise<void> {
    const user: UserEntity | null = await this.usersRepository.findByEmail(dto.email);
    if (!user || !user.id) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Invalid recovery data',
      });
    }

    const passwordRecoveryEntity = new PasswordRecoveryEntity({
      id: randomUUID(),
      userId: user.id,
      recoveryCode: this.generateConfirmationCode(),
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    try {
      await this.passwordRecoveryRepository.deleteByUserId(user.id);
      await this.passwordRecoveryRepository.save(passwordRecoveryEntity);

      await this.emailAdapter.sendPasswordRecoveryCode(
        user.email,
        passwordRecoveryEntity.recoveryCode,
      );
    } catch (e) {
      throw new DomainException({ code: DomainExceptionCode.InternalServerError, message: `${e}` });
    }
  }

  private generateConfirmationCode(): string {
    return randomBytes(3).toString('hex').toUpperCase();
  }
}
