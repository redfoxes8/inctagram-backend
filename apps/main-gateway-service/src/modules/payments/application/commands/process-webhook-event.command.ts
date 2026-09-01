import { ICommand, ICommandHandler, CommandHandler } from '@nestjs/cqrs';

import { PaymentGrpcAdapter } from '../../infrastructure/payment-grpc.adapter';
import { PaymentProviderCode } from '../types/payment-provider-code.type';

export type ProviderSignatureHeader = Readonly<{
  name: string;
  value: string;
}>;

export type ProcessWebhookEventCommandDto = {
  provider: PaymentProviderCode;
  rawBody: Uint8Array;
  signatureHeaders: readonly ProviderSignatureHeader[];
  receivedAt: string;
};

export type ProcessWebhookEventResult = Readonly<{
  accepted: boolean;
  duplicate: boolean;
  status: 'RECEIVED' | 'PROCESSED' | 'IGNORED' | 'FAILED';
}>;

export class ProcessWebhookEventCommand implements ICommand {
  constructor(public readonly dto: ProcessWebhookEventCommandDto) {}
}

@CommandHandler(ProcessWebhookEventCommand)
export class ProcessWebhookEventHandler implements ICommandHandler<
  ProcessWebhookEventCommand,
  ProcessWebhookEventResult
> {
  constructor(private readonly paymentAdapter: PaymentGrpcAdapter) {}

  async execute(command: ProcessWebhookEventCommand): Promise<ProcessWebhookEventResult> {
    return this.paymentAdapter.processWebhookEvent(command.dto);
  }
}
