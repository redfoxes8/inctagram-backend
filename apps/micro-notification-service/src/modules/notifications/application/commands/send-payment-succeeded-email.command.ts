import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { IUserGrpcAdapter } from '../../infrastructure/grpc/user/interfaces/user-grpc-adapter.interface';
import { IMailAdapter } from '../../../../application/interfaces/mail-adapter.interface';
import { NotificationMessageFactory } from '../factories/notification-message.factory';

export class SendPaymentSucceededEmailCommand {
  constructor(
    public readonly userId: string,
    public readonly subscriptionId: string,
    public readonly amount: string,
    public readonly currency: string,
  ) {}
}

@CommandHandler(SendPaymentSucceededEmailCommand)
export class SendPaymentSucceededEmailHandler implements ICommandHandler<SendPaymentSucceededEmailCommand> {
  constructor(
    private readonly userGrpcAdapter: IUserGrpcAdapter,
    private readonly mailAdapter: IMailAdapter,
  ) {}

  async execute(command: SendPaymentSucceededEmailCommand): Promise<void> {
    const user = await this.userGrpcAdapter.getUserById(command.userId);

    const email = NotificationMessageFactory.buildPaymentSucceededMessage(user, command);

    await this.mailAdapter.sendEmail(email);
  }
}
