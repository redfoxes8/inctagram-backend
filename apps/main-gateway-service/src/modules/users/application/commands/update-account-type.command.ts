import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';

import { IUsersRepository } from '../../domain/interfaces/users.repository.interface';
import { AccountType } from '../../../../core/prisma/client';

type UpdateAccountTypeCommandParams = {
  userId: string;
  accountType: AccountType;
};

export class UpdateAccountTypeCommand {
  constructor(public readonly params: UpdateAccountTypeCommandParams) {}
}

@CommandHandler(UpdateAccountTypeCommand)
export class UpdateAccountTypeHandler implements ICommandHandler<UpdateAccountTypeCommand, void> {
  private readonly logger = new Logger(UpdateAccountTypeHandler.name);

  constructor(private readonly usersRepository: IUsersRepository) {}

  async execute(command: UpdateAccountTypeCommand): Promise<void> {
    const { userId, accountType } = command.params;

    this.logger.debug(`[UpdateAccountType] started userId=${userId} accountType=${accountType}`);

    const user = await this.usersRepository.findById(userId);

    if (!user) {
      throw new DomainException({
        code: DomainExceptionCode.NotFound,
        message: `User with id ${userId} was not found`,
      });
    }

    user.changeAccountType(accountType);

    await this.usersRepository.update(user);

    this.logger.debug(`[UpdateAccountType] completed userId=${userId} accountType=${accountType}`);
  }
}
