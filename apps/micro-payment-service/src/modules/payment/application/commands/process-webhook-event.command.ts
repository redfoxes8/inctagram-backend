import { Command, CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { paymentOperationNotReady } from '../payment-operation-not-ready.exception';
import { ProcessWebhookEventInput, ProcessWebhookEventResult } from '../types/payment-grpc.types';

export class ProcessWebhookEventCommand extends Command<ProcessWebhookEventResult> {
  constructor(public readonly input: ProcessWebhookEventInput) {
    super();
  }
}

@CommandHandler(ProcessWebhookEventCommand)
export class ProcessWebhookEventHandler implements ICommandHandler<
  ProcessWebhookEventCommand,
  ProcessWebhookEventResult
> {
  public execute(command: ProcessWebhookEventCommand): Promise<ProcessWebhookEventResult> {
    void command;
    return Promise.reject(paymentOperationNotReady());
  }
}
