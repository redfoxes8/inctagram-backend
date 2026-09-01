import {
  BaseDomainEntity,
  BaseDomainEntityProps,
} from '../../../../../../../libs/common/src/domain/base.domain.entity';
import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { ProviderWebhookEventStatus } from '../enums/provider-webhook-event-status.enum';
import { assertProviderIdentifier } from '../specifications/provider-identifier.specification';
import {
  assertNonNegativeAttempts,
  assertPositiveMaxAttempts,
  assertProviderWebhookEventStatus,
  assertProviderWebhookEventType,
  assertWebhookDiagnostic,
} from '../specifications/provider-webhook-event.specification';
import {
  cloneJsonValue,
  normalizeProviderWebhookPayload,
} from '../specifications/provider-webhook-payload.specification';
import { assertUuidIdentifier } from '../specifications/uuid-identifier.specification';
import { assertValidDate } from '../specifications/valid-date.specification';
import { JsonValue } from '../types/json-value.type';
import { ProviderCode } from '../value-objects/provider-code.value-object';

type ProviderWebhookEventLifecycleProps = Pick<
  BaseDomainEntityProps<string>,
  'id' | 'createdAt' | 'updatedAt'
>;

export type CreateProviderWebhookEventProps = ProviderWebhookEventLifecycleProps & {
  provider: ProviderCode;
  providerEventId: string;
  eventType: string;
  payload: unknown;
  receivedAt: Date;
};

export type ProviderWebhookEventEntityProps = CreateProviderWebhookEventProps & {
  status: ProviderWebhookEventStatus;
  attempts: number;
  processingError: string | null;
  ignoredReason: string | null;
  processedAt: Date | null;
};

export class ProviderWebhookEventEntity extends BaseDomainEntity<string> {
  private readonly provider: ProviderCode;
  private readonly providerEventId: string;
  private readonly eventType: string;
  private status: ProviderWebhookEventStatus;
  private readonly payload: JsonValue;
  private attempts: number;
  private processingError: string | null;
  private ignoredReason: string | null;
  private readonly receivedAt: Date;
  private processedAt: Date | null;

  constructor(props: ProviderWebhookEventEntityProps) {
    const payload = normalizeProviderWebhookPayload(props.payload);
    ProviderWebhookEventEntity.assertConstructionInvariants({ ...props, payload });
    super({
      id: props.id,
      createdAt: props.createdAt ? new Date(props.createdAt.getTime()) : undefined,
      updatedAt: props.updatedAt ? new Date(props.updatedAt.getTime()) : undefined,
    });
    this.provider = props.provider;
    this.providerEventId = props.providerEventId;
    this.eventType = props.eventType;
    this.status = props.status;
    this.payload = payload;
    this.attempts = props.attempts;
    this.processingError = props.processingError;
    this.ignoredReason = props.ignoredReason;
    this.receivedAt = new Date(props.receivedAt.getTime());
    this.processedAt = props.processedAt ? new Date(props.processedAt.getTime()) : null;
  }

  public static createReceived(props: CreateProviderWebhookEventProps): ProviderWebhookEventEntity {
    return new ProviderWebhookEventEntity({
      ...props,
      status: ProviderWebhookEventStatus.RECEIVED,
      attempts: 0,
      processingError: null,
      ignoredReason: null,
      processedAt: null,
    });
  }

  public getProvider(): ProviderCode {
    return this.provider;
  }

  public getProviderEventId(): string {
    return this.providerEventId;
  }

  public getEventType(): string {
    return this.eventType;
  }

  public getStatus(): ProviderWebhookEventStatus {
    return this.status;
  }

  public getPayload(): JsonValue {
    return cloneJsonValue(this.payload);
  }

  public getAttempts(): number {
    return this.attempts;
  }

  public getProcessingError(): string | null {
    return this.processingError;
  }

  public getIgnoredReason(): string | null {
    return this.ignoredReason;
  }

  public getReceivedAt(): Date {
    return new Date(this.receivedAt.getTime());
  }

  public getProcessedAt(): Date | null {
    return this.processedAt ? new Date(this.processedAt.getTime()) : null;
  }

  public startProcessing(maxAttempts: number): void {
    assertPositiveMaxAttempts(maxAttempts);
    if (
      this.status !== ProviderWebhookEventStatus.RECEIVED &&
      this.status !== ProviderWebhookEventStatus.FAILED
    ) {
      throw ProviderWebhookEventEntity.conflict(
        'Webhook event is not eligible for a processing claim',
      );
    }
    const nextAttempt = this.attempts + 1;
    if (!Number.isSafeInteger(nextAttempt) || nextAttempt > maxAttempts) {
      throw ProviderWebhookEventEntity.conflict('Webhook event attempt limit is exhausted');
    }
    this.status = ProviderWebhookEventStatus.PROCESSING;
    this.attempts = nextAttempt;
    this.processingError = null;
    this.touch();
  }

  public markProcessed(processedAt: Date): void {
    ProviderWebhookEventEntity.assertProcessedAt({ processedAt, receivedAt: this.receivedAt });
    if (this.status === ProviderWebhookEventStatus.PROCESSED) {
      if (this.processedAt?.getTime() === processedAt.getTime()) return;
      throw ProviderWebhookEventEntity.conflict('Processed webhook fact cannot be replaced');
    }
    if (this.status !== ProviderWebhookEventStatus.PROCESSING) {
      throw ProviderWebhookEventEntity.conflict('Only a processing webhook event can be processed');
    }
    this.status = ProviderWebhookEventStatus.PROCESSED;
    this.processedAt = new Date(processedAt.getTime());
    this.touch();
  }

  public markFailed(processingError: string): void {
    assertWebhookDiagnostic(processingError);
    if (this.status === ProviderWebhookEventStatus.FAILED) {
      if (this.processingError === processingError) return;
      throw ProviderWebhookEventEntity.conflict('Webhook failure detail cannot be replaced');
    }
    if (this.status !== ProviderWebhookEventStatus.PROCESSING) {
      throw ProviderWebhookEventEntity.conflict(
        'Only a processing webhook event can be marked failed',
      );
    }
    this.status = ProviderWebhookEventStatus.FAILED;
    this.processingError = processingError;
    this.touch();
  }

  public markIgnored(props: { ignoredReason: string; processedAt: Date }): void {
    assertWebhookDiagnostic(props.ignoredReason);
    ProviderWebhookEventEntity.assertProcessedAt({
      processedAt: props.processedAt,
      receivedAt: this.receivedAt,
    });
    if (this.status === ProviderWebhookEventStatus.IGNORED) {
      if (
        this.ignoredReason === props.ignoredReason &&
        this.processedAt?.getTime() === props.processedAt.getTime()
      ) {
        return;
      }
      throw ProviderWebhookEventEntity.conflict('Ignored webhook facts cannot be replaced');
    }
    if (this.status !== ProviderWebhookEventStatus.PROCESSING) {
      throw ProviderWebhookEventEntity.conflict('Only a processing webhook event can be ignored');
    }
    this.status = ProviderWebhookEventStatus.IGNORED;
    this.ignoredReason = props.ignoredReason;
    this.processedAt = new Date(props.processedAt.getTime());
    this.touch();
  }

  private static assertConstructionInvariants(
    props: ProviderWebhookEventEntityProps & { payload: JsonValue },
  ): void {
    assertUuidIdentifier(props.id);
    if (!(props.provider instanceof ProviderCode)) {
      throw ProviderWebhookEventEntity.badRequest('Webhook event requires a valid provider');
    }
    assertProviderIdentifier(props.providerEventId);
    assertProviderWebhookEventType(props.eventType);
    assertProviderWebhookEventStatus(props.status);
    assertNonNegativeAttempts(props.attempts);
    assertValidDate({ value: props.receivedAt, message: 'Received time must be a valid Date' });
    if (props.processedAt !== null) {
      ProviderWebhookEventEntity.assertProcessedAt({
        processedAt: props.processedAt,
        receivedAt: props.receivedAt,
      });
    }
    ProviderWebhookEventEntity.assertStatusFacts(props);
  }

  private static assertStatusFacts(props: ProviderWebhookEventEntityProps): void {
    if (props.status === ProviderWebhookEventStatus.RECEIVED) {
      if (
        props.attempts !== 0 ||
        props.processingError !== null ||
        props.ignoredReason !== null ||
        props.processedAt !== null
      ) {
        throw ProviderWebhookEventEntity.badRequest('Received webhook facts are inconsistent');
      }
      return;
    }
    if (props.attempts < 1) {
      throw ProviderWebhookEventEntity.badRequest(
        'Claimed webhook event requires at least one attempt',
      );
    }
    if (props.status === ProviderWebhookEventStatus.PROCESSING) {
      ProviderWebhookEventEntity.assertEmptyTerminalFacts(props);
      return;
    }
    if (props.status === ProviderWebhookEventStatus.PROCESSED) {
      if (
        props.processingError !== null ||
        props.ignoredReason !== null ||
        props.processedAt === null
      ) {
        throw ProviderWebhookEventEntity.badRequest('Processed webhook facts are inconsistent');
      }
      return;
    }
    if (props.status === ProviderWebhookEventStatus.FAILED) {
      if (
        props.processingError === null ||
        props.ignoredReason !== null ||
        props.processedAt !== null
      ) {
        throw ProviderWebhookEventEntity.badRequest('Failed webhook facts are inconsistent');
      }
      assertWebhookDiagnostic(props.processingError);
      return;
    }
    if (
      props.processingError !== null ||
      props.ignoredReason === null ||
      props.processedAt === null
    ) {
      throw ProviderWebhookEventEntity.badRequest('Ignored webhook facts are inconsistent');
    }
    assertWebhookDiagnostic(props.ignoredReason);
  }

  private static assertEmptyTerminalFacts(props: ProviderWebhookEventEntityProps): void {
    if (
      props.processingError !== null ||
      props.ignoredReason !== null ||
      props.processedAt !== null
    ) {
      throw ProviderWebhookEventEntity.badRequest('Processing webhook facts are inconsistent');
    }
  }

  private static assertProcessedAt(props: { processedAt: Date; receivedAt: Date }): void {
    assertValidDate({ value: props.processedAt, message: 'Processed time must be a valid Date' });
    if (props.processedAt.getTime() < props.receivedAt.getTime()) {
      throw ProviderWebhookEventEntity.badRequest(
        'Processed time cannot be earlier than received time',
      );
    }
  }

  private static badRequest(message: string): DomainException {
    return new DomainException({ code: DomainExceptionCode.BadRequest, message });
  }

  private static conflict(message: string): DomainException {
    return new DomainException({ code: DomainExceptionCode.Conflict, message });
  }
}
