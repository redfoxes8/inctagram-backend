import { Command, CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { PaymentProviderResolver } from '../ports/payment-provider-resolver.port';
import { PAYMENT_PROVIDER_ERROR_REASON } from '../ports/payment-provider.types';
import { ProcessWebhookEventInput, ProcessWebhookEventResult } from '../types/payment-grpc.types';
import { ProviderCode } from '../../domain/value-objects/provider-code.value-object';

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
  constructor(private readonly providerResolver: PaymentProviderResolver) {}

  public async execute(command: ProcessWebhookEventCommand): Promise<ProcessWebhookEventResult> {
    const provider = new ProviderCode(command.input.provider);
    const strategy = this.providerResolver.resolve(provider);
    const event = await strategy.verifyAndParseWebhook({
      provider,
      rawBody: command.input.rawBody,
      signatureHeaders: command.input.signatureHeaders,
      receivedAt: command.input.receivedAt.toISOString(),
    });

    if (event.kind === 'IGNORED') {
      return { accepted: true, duplicate: false, status: 'IGNORED' };
    }

    throw new DomainException({
      code: DomainExceptionCode.ServiceUnavailable,
      message: 'Payment webhook processing is not available yet',
      extensions: [
        {
          field: 'reason',
          message: PAYMENT_PROVIDER_ERROR_REASON.PAYMENT_WEBHOOK_PROCESSING_NOT_READY,
        },
      ],
    });
  }
}
