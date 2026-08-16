import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { ProviderWebhookEventStatus } from '../enums/provider-webhook-event-status.enum';
import {
  assertNonNegativePersistedInteger,
  assertPositivePersistedInteger,
} from './persisted-integer.specification';

const EVENT_TYPE_FORMAT = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/;
const MAX_DIAGNOSTIC_LENGTH = 500;

export function assertProviderWebhookEventType(eventType: string): void {
  if (!EVENT_TYPE_FORMAT.test(eventType)) {
    throw badRequest('Provider event type must use 1-255 safe machine-code characters');
  }
}

export function assertProviderWebhookEventStatus(status: ProviderWebhookEventStatus): void {
  if (!Object.values(ProviderWebhookEventStatus).includes(status)) {
    throw badRequest('Provider webhook event status is not supported');
  }
}

export function assertWebhookDiagnostic(diagnostic: string): void {
  if (
    diagnostic.length === 0 ||
    diagnostic.length > MAX_DIAGNOSTIC_LENGTH ||
    diagnostic.trim() !== diagnostic ||
    containsControlCharacters(diagnostic)
  ) {
    throw badRequest('Webhook diagnostic must be a safe string of at most 500 characters');
  }
}

export function assertNonNegativeAttempts(attempts: number): void {
  assertNonNegativePersistedInteger(attempts, 'Webhook attempts');
}

export function assertPositiveMaxAttempts(maxAttempts: number): void {
  assertPositivePersistedInteger(maxAttempts, 'Maximum webhook attempts');
}

function containsControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });
}

function badRequest(message: string): DomainException {
  return new DomainException({ code: DomainExceptionCode.BadRequest, message });
}
