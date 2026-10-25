import { maxLength } from 'class-validator';
import { DomainException } from '../exceptions/domain-exception';
import { DomainExceptionCode } from '../exceptions/domain-exception-codes';
import {
  SuperadminPaymentsSort,
  type SuperadminPaymentsInput,
  type SuperadminPaymentsFilter,
} from '../../types/superadmin-payments-list';

export function normalizeSuperadminPaymentsFilter(
  input: SuperadminPaymentsInput,
): SuperadminPaymentsFilter {
  const page = input.page === undefined ? 1 : input.page;
  const sort = input.sort === undefined ? SuperadminPaymentsSort.CreatedAtDesc : input.sort;
  const search = input.searchUsername;
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 10000 ||
    !Object.values(SuperadminPaymentsSort).includes(sort) ||
    (search !== undefined && search !== null && typeof search !== 'string')
  )
    throw invalidInput();
  const searchUsername = search?.trim() || null;
  // Same trim + class-validator length semantics as the existing catalog (Unicode code points).
  if (searchUsername !== null && !maxLength(searchUsername, 100)) throw invalidInput();
  return { page, sort, searchUsername };
}
function invalidInput(): DomainException {
  return new DomainException({
    code: DomainExceptionCode.BadRequest,
    message: 'Invalid superadmin payments input',
  });
}
