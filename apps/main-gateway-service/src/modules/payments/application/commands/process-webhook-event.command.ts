import { ICommand, ICommandHandler, CommandHandler } from '@nestjs/cqrs';

import Stripe from 'stripe';

import { PaymentGrpcAdapter } from '../../infrastructure/payment-grpc.adapter';

export type ProcessWebhookEventCommandDto = {
  event: Stripe.Event;
  rawBody: Buffer;
};

export class ProcessWebhookEventCommand implements ICommand {
  constructor(public readonly dto: ProcessWebhookEventCommandDto) {}
}

@CommandHandler(ProcessWebhookEventCommand)
export class ProcessWebhookEventHandler implements ICommandHandler<ProcessWebhookEventCommand> {
  constructor(private readonly paymentAdapter: PaymentGrpcAdapter) {}

  async execute(command: ProcessWebhookEventCommand): Promise<void> {
    await this.paymentAdapter.processWebhookEvent(command.dto);
  }
}
