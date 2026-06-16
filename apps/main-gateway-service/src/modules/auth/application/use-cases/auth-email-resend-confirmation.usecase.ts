import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { randomBytes } from 'crypto';
import { EmailResendDto } from '../../api/dto/email-resend.dto';
import { IUsersRepository } from '../../../users/domain/interfaces/users.repository.interface';
import { IEmailConfirmationRepository } from '../../domain/interfaces/email-confirmation.repository.interface';
import { IEmailAdapter } from '../interfaces/email.adapter.interface';
import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { CoreConfig } from '../../../../../../../libs/common/src/core.config';

export class AuthEmailResendConfirmationCommand {
  constructor(public dto: EmailResendDto) {}
}

@CommandHandler(AuthEmailResendConfirmationCommand)
export class AuthEmailResendConfirmationUseCase
  implements ICommandHandler<AuthEmailResendConfirmationCommand, void | string>
{
  constructor(
    private usersRepository: IUsersRepository,
    private emailConfirmationRepository: IEmailConfirmationRepository,
    private emailAdapter: IEmailAdapter,
    private coreConfig: CoreConfig,
  ) {}

  async execute({ dto }: AuthEmailResendConfirmationCommand): Promise<void | string> {
    const user = await this.usersRepository.findByEmail(dto.email);

    if (!user) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'User with this email not found',
        extensions: [{ field: 'email', message: 'User not found' }],
      });
    }

    if (user.isConfirmed) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Email is already confirmed',
        extensions: [{ field: 'email', message: 'Email already confirmed' }],
      });
    }

    const confirmation = await this.emailConfirmationRepository.findByUserId(user.id);

    if (!confirmation) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Confirmation record missing',
      });
    }

    if (!confirmation.isExpired()) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message:
          'The confirmation code is still valid. Please wait for the code to expire or use the /registration endpoint to reset the process.',
        extensions: [{ field: 'email', message: 'The confirmation code is still valid' }],
      });
    }

    const newCode = this.generateConfirmationCode();
    confirmation.refreshCode(newCode);

    await this.emailConfirmationRepository.update(confirmation);

    if (this.coreConfig.env === 'test') {
      return newCode;
    }

    await this.emailAdapter.sendRegistrationCode(user.email, newCode);
  }

  private generateConfirmationCode(): string {
    return randomBytes(3).toString('hex').toUpperCase();
  }
}
