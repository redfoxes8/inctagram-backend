import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';

import { PaymentGrpcAdapter } from '../../infrastructure/payment-grpc.adapter';
import { ToggleAutoRenewResponseDto } from '../../api/dto/toggle-auto-renew.response';

export type ToggleAutoRenewCommandDto = {
  userId: string;
  subscriptionId: string;
  enabled: boolean;
};

export class ToggleAutoRenewCommand implements ICommand {
  constructor(public readonly dto: ToggleAutoRenewCommandDto) {}
}

@CommandHandler(ToggleAutoRenewCommand)
export class ToggleAutoRenewHandler implements ICommandHandler<ToggleAutoRenewCommand> {
  constructor(private readonly paymentAdapter: PaymentGrpcAdapter) {}

  async execute(command: ToggleAutoRenewCommand): Promise<ToggleAutoRenewResponseDto> {
    return this.paymentAdapter.toggleAutoRenew(command.dto);
  }
}
