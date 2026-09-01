import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { IUserGrpcAdapter } from '../../infrastructure/grpc/user/interfaces/user-grpc-adapter.interface';
import { IMailAdapter } from '../../../../application/interfaces/mail-adapter.interface';
import { NotificationMessageFactory } from '../factories/notification-message.factory';

export class SendSubscriptionExpiredEmailCommand {
  constructor(
    public readonly userId: string,
    public readonly subscriptionId: string,
  ) {}
}

@CommandHandler(SendSubscriptionExpiredEmailCommand)
export class SendSubscriptionExpiredEmailHandler implements ICommandHandler<SendSubscriptionExpiredEmailCommand> {
  constructor(
    private readonly userGrpcAdapter: IUserGrpcAdapter,
    private readonly mailAdapter: IMailAdapter,
  ) {}

  async execute(command: SendSubscriptionExpiredEmailCommand): Promise<void> {
    const user = await this.userGrpcAdapter.getUserById(command.userId);

    const email = NotificationMessageFactory.buildSubscriptionExpiredMessage(user, command);

    await this.mailAdapter.sendEmail(email);
  }
}
