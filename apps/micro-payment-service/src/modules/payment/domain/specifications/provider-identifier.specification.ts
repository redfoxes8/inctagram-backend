import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';

const MAX_PROVIDER_IDENTIFIER_LENGTH = 255;

export function assertProviderIdentifier(value: string): void {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_PROVIDER_IDENTIFIER_LENGTH ||
    value.trim() !== value ||
    containsControlCharacters(value)
  ) {
    throw new DomainException({
      code: DomainExceptionCode.BadRequest,
      message: 'Provider identifier must be a non-empty safe string of at most 255 characters',
    });
  }
}

function containsControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });
}
