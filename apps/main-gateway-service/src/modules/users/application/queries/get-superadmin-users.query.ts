import { Injectable } from '@nestjs/common';
import type {
  SuperadminUsersFilter,
  SuperadminUsersPage,
} from '../../../../../../../libs/common/types/superadmin-users';
import { SuperadminUsersQueryRepository } from '../../domain/interfaces/superadmin-users.query-repository';
import { toSuperadminUserListItem } from './superadmin-user.mapper';

@Injectable()
export class GetSuperadminUsersQuery {
  constructor(private readonly repository: SuperadminUsersQueryRepository) {}

  async execute(input: SuperadminUsersFilter): Promise<SuperadminUsersPage> {
    const { items, totalCount } = await this.repository.findPage({
      ...input,
      searchUsername: input.searchUsername?.trim() || null,
    });
    const pagesCount = Math.ceil(totalCount / input.pageSize);
    return {
      items: items.map(toSuperadminUserListItem),
      totalCount,
      pageInfo: {
        page: input.page,
        pageSize: input.pageSize,
        pagesCount,
        hasNextPage: input.page < pagesCount,
      },
    };
  }
}
