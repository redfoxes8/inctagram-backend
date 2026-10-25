import { IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs';
import { ISuperadminPaymentsQueryPort } from '../ports/superadmin-payments-query.port';
import { normalizeSuperadminPaymentsFilter } from '../../../../../../../libs/common/src/validation/normalize-superadmin-payments-filter';
import {
  SUPERADMIN_PAYMENTS_PAGE_SIZE,
  type SuperadminPaymentsInput,
  type SuperadminPaymentsReadPage,
} from '../../../../../../../libs/common/types/superadmin-payments-list';

export class GetSuperadminPaymentsPageQuery extends Query<SuperadminPaymentsReadPage> {
  constructor(public readonly input: SuperadminPaymentsInput) {
    super();
  }
}
@QueryHandler(GetSuperadminPaymentsPageQuery)
export class GetSuperadminPaymentsPageHandler implements IQueryHandler<
  GetSuperadminPaymentsPageQuery,
  SuperadminPaymentsReadPage
> {
  constructor(private readonly repository: ISuperadminPaymentsQueryPort) {}
  async execute(query: GetSuperadminPaymentsPageQuery): Promise<SuperadminPaymentsReadPage> {
    const filter = normalizeSuperadminPaymentsFilter(query.input);
    const result = await this.repository.findPage(filter);
    const pagesCount = Math.ceil(result.totalCount / SUPERADMIN_PAYMENTS_PAGE_SIZE);
    return {
      ...result,
      pageInfo: {
        page: filter.page,
        pageSize: SUPERADMIN_PAYMENTS_PAGE_SIZE,
        pagesCount,
        hasNextPage: filter.page < pagesCount,
      },
    };
  }
}
