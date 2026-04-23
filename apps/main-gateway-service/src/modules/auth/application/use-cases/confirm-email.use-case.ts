import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { IEmailConfirmationRepository } from '../../domain/interfaces/email-confirmation.repository.interface';
import { IUsersRepository } from '../../../users/domain/interfaces/users.repository.interface';
import { EmailConfirmationEntity } from '../../domain/email-confirmation.entity';
import { UserEntity } from '../../../users/domain/user.entity';

type ConfirmEmailDTO = {
  code: string;
};

export class ConfirmEmailCommand {
  constructor(public dto: ConfirmEmailDTO) {}
}

export class ConfirmEmailUseCase {
  constructor(
    private readonly emailConfirmationRepository: IEmailConfirmationRepository,
    private readonly usersRepository: IUsersRepository,
  ) {}

  public async execute({ dto }: ConfirmEmailCommand): Promise<void> {
    const confirmation: EmailConfirmationEntity | null =
      await this.emailConfirmationRepository.findByCode(dto.code);
    if (!confirmation) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Confirmation not found',
      });
    }

    if (confirmation.confirmationCode !== dto.code) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Invalid confirmation code',
      });
    }

    confirmation.confirm();

    const user: UserEntity | null = await this.usersRepository.findById(confirmation.userId);
    if (!user) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'User not found',
      });
    }

    user.confirmEmail();
    await this.usersRepository.update(user);
    await this.emailConfirmationRepository.update(confirmation);
  }
}
