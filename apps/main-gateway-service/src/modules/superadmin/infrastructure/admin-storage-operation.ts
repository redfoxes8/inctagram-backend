import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';

export async function adminStorageOperation<Result>(
  operation: () => Promise<Result>,
): Promise<Result> {
  try {
    return await operation();
  } catch {
    // Never pass driver errors/parameters (including digests) to the public API or logs.
    throw new DomainException({
      code: DomainExceptionCode.ServiceUnavailable,
      message: 'Service unavailable',
    });
  }
}
