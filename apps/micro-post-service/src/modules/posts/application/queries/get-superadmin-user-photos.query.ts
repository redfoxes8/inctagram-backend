import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { isUUID } from 'class-validator';
import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { SuperadminUserPhotosMapper } from '../mappers/superadmin-user-photos.mapper';
import {
  SuperadminUserPhotosRead,
  type SuperadminUserPhotosInput,
  type SuperadminUserPhotosPage,
} from '../ports/superadmin-user-photos.port';

export class GetSuperadminUserPhotosQuery {
  constructor(readonly input: SuperadminUserPhotosInput) {}
}

@QueryHandler(GetSuperadminUserPhotosQuery)
export class GetSuperadminUserPhotosHandler implements IQueryHandler<
  GetSuperadminUserPhotosQuery,
  SuperadminUserPhotosPage
> {
  constructor(
    private readonly photos: SuperadminUserPhotosRead,
    private readonly mapper: SuperadminUserPhotosMapper,
  ) {}

  async execute(query: GetSuperadminUserPhotosQuery): Promise<SuperadminUserPhotosPage> {
    const { userId, page, pageSize } = query.input;
    if (
      !isUUID(userId) ||
      !Number.isInteger(page) ||
      page < 1 ||
      page > 10000 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 50
    ) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Invalid photos input',
      });
    }
    const result = await this.photos.findPage({ userId, page, pageSize });
    const pagesCount = Math.ceil(result.totalCount / pageSize);
    return {
      items: await this.mapper.map(result.items),
      totalCount: result.totalCount,
      pageInfo: { page, pageSize, pagesCount, hasNextPage: page < pagesCount },
    };
  }
}
