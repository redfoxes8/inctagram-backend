import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';

import { PaymentGrpcAdapter } from '../../infrastructure/payment-grpc.adapter';
import { ToggleAutoRenewDto } from '../../api/dto/toggle-auto-renew.dto';

export type ToggleAutoRenewCommandDto = {
  userId: string;
  subscriptionId: string;
  dto: ToggleAutoRenewDto;
};

export class ToggleAutoRenewCommand implements ICommand {
  constructor(public readonly dto: ToggleAutoRenewCommandDto) {}
}

@CommandHandler(ToggleAutoRenewCommand)
export class ToggleAutoRenewHandler implements ICommandHandler<ToggleAutoRenewCommand> {
  constructor(private readonly paymentAdapter: PaymentGrpcAdapter) {}

  async execute(command: ToggleAutoRenewCommand) {
    return this.paymentAdapter.toggleAutoRenew(command.dto);
  }
}
