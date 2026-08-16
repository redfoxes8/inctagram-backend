import { Command, CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { paymentOperationNotReady } from '../payment-operation-not-ready.exception';
import { ToggleAutoRenewInput, ToggleAutoRenewResult } from '../types/payment-grpc.types';

export class ToggleAutoRenewCommand extends Command<ToggleAutoRenewResult> {
  constructor(public readonly input: ToggleAutoRenewInput) {
    super();
  }
}

@CommandHandler(ToggleAutoRenewCommand)
export class ToggleAutoRenewHandler implements ICommandHandler<
  ToggleAutoRenewCommand,
  ToggleAutoRenewResult
> {
  public execute(command: ToggleAutoRenewCommand): Promise<ToggleAutoRenewResult> {
    void command;
    return Promise.reject(paymentOperationNotReady());
  }
}
