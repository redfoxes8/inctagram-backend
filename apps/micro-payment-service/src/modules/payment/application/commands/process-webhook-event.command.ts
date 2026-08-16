import { Inject } from '@nestjs/common';
import { Command, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { randomUUID } from 'crypto';

import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { ProviderWebhookEventEntity } from '../../domain/entities/provider-webhook-event.entity';
import { ProviderWebhookEventStatus } from '../../domain/enums/provider-webhook-event-status.enum';
import { IProviderWebhookEventRepository } from '../../domain/interfaces/provider-webhook-event.repository.interface';
import { MAX_PERSISTED_INTEGER } from '../../domain/specifications/persisted-integer.specification';
import { ProviderCode } from '../../domain/value-objects/provider-code.value-object';
import { PaymentProviderResolver } from '../ports/payment-provider-resolver.port';
import { PAYMENT_WEBHOOK_PROCESSING_TIMEOUT_SECONDS } from '../ports/payment-provider.tokens';
import {
  NormalizedProviderEvent,
  PAYMENT_PROVIDER_ERROR_REASON,
} from '../ports/payment-provider.types';
import { IPaymentUnitOfWork } from '../ports/payment-unit-of-work.port';
import { PaymentWebhookProcessor } from '../ports/payment-webhook-processor.port';
import { serializeNormalizedWebhookPayload } from '../services/normalized-webhook-payload.serializer';
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
  constructor(
    private readonly providerResolver: PaymentProviderResolver,
    private readonly webhookEvents: IProviderWebhookEventRepository,
    private readonly unitOfWork: IPaymentUnitOfWork,
    private readonly processor: PaymentWebhookProcessor,
    @Inject(PAYMENT_WEBHOOK_PROCESSING_TIMEOUT_SECONDS)
    private readonly processingTimeoutSeconds: number,
  ) {}

  public async execute(command: ProcessWebhookEventCommand): Promise<ProcessWebhookEventResult> {
    const provider = new ProviderCode(command.input.provider);
    const strategy = this.providerResolver.resolve(provider);
    const event = await strategy.verifyAndParseWebhook({
      provider,
      rawBody: command.input.rawBody,
      signatureHeaders: command.input.signatureHeaders,
      receivedAt: command.input.receivedAt.toISOString(),
    });

    const candidate = this.createJournalEvent(event, command.input.receivedAt);

    if (event.kind === 'IGNORED') return this.registerIgnored(candidate, event.reasonCode);

    const registration = await this.webhookEvents.insertOrGet(candidate);
    if (this.isTerminal(registration.event.getStatus())) {
      return { accepted: true, duplicate: true, status: this.terminalStatus(registration.event) };
    }

    const claimed = await this.claim(event);
    if (!claimed) return this.classifyUnclaimed(event);

    try {
      await this.processor.process(event);
    } catch (error: unknown) {
      await this.markFailed(event);
      if (error instanceof DomainException) throw error;
      throw this.handlerNotReady();
    }

    await this.markProcessed(event);
    return { accepted: true, duplicate: !registration.inserted, status: 'PROCESSED' };
  }

  private createJournalEvent(
    event: NormalizedProviderEvent,
    receivedAt: Date,
  ): ProviderWebhookEventEntity {
    return ProviderWebhookEventEntity.createReceived({
      id: randomUUID(),
      provider: event.provider,
      providerEventId: event.providerEventId,
      eventType: event.providerEventType,
      payload: serializeNormalizedWebhookPayload(event),
      receivedAt,
    });
  }

  private async registerIgnored(
    candidate: ProviderWebhookEventEntity,
    reasonCode: string,
  ): Promise<ProcessWebhookEventResult> {
    candidate.startProcessing(MAX_PERSISTED_INTEGER);
    candidate.markIgnored({ ignoredReason: reasonCode, processedAt: candidate.getReceivedAt() });
    const registration = await this.webhookEvents.insertOrGet(candidate);
    if (!registration.inserted && !this.isTerminal(registration.event.getStatus())) {
      throw this.alreadyProcessing();
    }
    return { accepted: true, duplicate: !registration.inserted, status: 'IGNORED' };
  }

  private claim(event: NormalizedProviderEvent): Promise<ProviderWebhookEventEntity | null> {
    const staleBefore = new Date(Date.now() - this.processingTimeoutSeconds * 1_000);
    return this.unitOfWork.execute((context) =>
      context.providerWebhookEvents.claimForProcessing({
        provider: event.provider,
        providerEventId: event.providerEventId,
        maxAttempts: MAX_PERSISTED_INTEGER,
        staleBefore,
      }),
    );
  }

  private async classifyUnclaimed(
    event: NormalizedProviderEvent,
  ): Promise<ProcessWebhookEventResult> {
    const existing = await this.webhookEvents.findByProviderEventId({
      provider: event.provider,
      providerEventId: event.providerEventId,
    });
    if (existing && this.isTerminal(existing.getStatus())) {
      return { accepted: true, duplicate: true, status: this.terminalStatus(existing) };
    }
    throw this.alreadyProcessing();
  }

  private async markFailed(event: NormalizedProviderEvent): Promise<void> {
    await this.unitOfWork.execute(async (context) => {
      const existing = await context.providerWebhookEvents.findByProviderEventId({
        provider: event.provider,
        providerEventId: event.providerEventId,
      });
      if (!existing || existing.getStatus() !== ProviderWebhookEventStatus.PROCESSING) return;
      existing.markFailed(PAYMENT_PROVIDER_ERROR_REASON.PAYMENT_WEBHOOK_HANDLER_NOT_READY);
      await context.providerWebhookEvents.save(existing);
    });
  }

  private async markProcessed(event: NormalizedProviderEvent): Promise<void> {
    await this.unitOfWork.execute(async (context) => {
      const existing = await context.providerWebhookEvents.findByProviderEventId({
        provider: event.provider,
        providerEventId: event.providerEventId,
      });
      if (!existing) throw this.handlerNotReady();
      const processedAt = new Date(Math.max(Date.now(), existing.getReceivedAt().getTime()));
      existing.markProcessed(processedAt);
      await context.providerWebhookEvents.save(existing);
    });
  }

  private isTerminal(status: ProviderWebhookEventStatus): boolean {
    return (
      status === ProviderWebhookEventStatus.PROCESSED ||
      status === ProviderWebhookEventStatus.IGNORED
    );
  }

  private terminalStatus(event: ProviderWebhookEventEntity): ProcessWebhookEventResult['status'] {
    return event.getStatus() === ProviderWebhookEventStatus.IGNORED ? 'IGNORED' : 'PROCESSED';
  }

  private alreadyProcessing(): DomainException {
    return new DomainException({
      code: DomainExceptionCode.ServiceUnavailable,
      message: 'Payment webhook is already being processed',
      extensions: [
        {
          field: 'reason',
          message: PAYMENT_PROVIDER_ERROR_REASON.PAYMENT_WEBHOOK_ALREADY_PROCESSING,
        },
      ],
    });
  }

  private handlerNotReady(): DomainException {
    return new DomainException({
      code: DomainExceptionCode.ServiceUnavailable,
      message: 'Payment webhook handler is not available yet',
      extensions: [
        {
          field: 'reason',
          message: PAYMENT_PROVIDER_ERROR_REASON.PAYMENT_WEBHOOK_HANDLER_NOT_READY,
        },
      ],
    });
  }
}
