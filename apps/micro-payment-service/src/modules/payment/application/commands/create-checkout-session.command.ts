import { Command, CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { paymentOperationNotReady } from '../payment-operation-not-ready.exception';
import {
  CreateCheckoutSessionInput,
  CreateCheckoutSessionResult,
} from '../types/payment-grpc.types';

export class CreateCheckoutSessionCommand extends Command<CreateCheckoutSessionResult> {
  constructor(public readonly input: CreateCheckoutSessionInput) {
    super();
  }
}

@CommandHandler(CreateCheckoutSessionCommand)
export class CreateCheckoutSessionHandler implements ICommandHandler<
  CreateCheckoutSessionCommand,
  CreateCheckoutSessionResult
> {
  public execute(command: CreateCheckoutSessionCommand): Promise<CreateCheckoutSessionResult> {
    void command;
    return Promise.reject(paymentOperationNotReady());
  }
}
