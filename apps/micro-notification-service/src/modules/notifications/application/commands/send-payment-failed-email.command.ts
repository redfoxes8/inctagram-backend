import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { IUserGrpcAdapter } from '../../infrastructure/grpc/user/interfaces/user-grpc-adapter.interface';
import { IMailAdapter } from '../../../../application/interfaces/mail-adapter.interface';
import { NotificationMessageFactory } from '../factories/notification-message.factory';

export class SendPaymentFailedEmailCommand {
  constructor(public readonly userId: string) {}
}

@CommandHandler(SendPaymentFailedEmailCommand)
export class SendPaymentFailedEmailHandler implements ICommandHandler<SendPaymentFailedEmailCommand> {
  constructor(
    private readonly userGrpcAdapter: IUserGrpcAdapter,
    private readonly mailAdapter: IMailAdapter,
  ) {}

  async execute(command: SendPaymentFailedEmailCommand): Promise<void> {
    const user = await this.userGrpcAdapter.getUserById(command.userId);

    const email = NotificationMessageFactory.buildPaymentFailedMessage(user);

    await this.mailAdapter.sendEmail(email);
  }
}
