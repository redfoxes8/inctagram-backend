import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  SuperadminUsersFilter,
  SuperadminUsersPage,
} from '../../../../../../../libs/common/types/superadmin-users';
import { SuperadminUsersQueryRepository } from '../../domain/interfaces/superadmin-users.query-repository';
import { toSuperadminUserListItem } from './superadmin-user.mapper';

@Injectable()
export class GetSuperadminUsersQuery {
  constructor(
    private readonly repository: SuperadminUsersQueryRepository,
    private readonly config: ConfigService,
  ) {}

  async execute(input: SuperadminUsersFilter): Promise<SuperadminUsersPage> {
    const { items, totalCount } = await this.repository.findPage({
      ...input,
      searchUsername: input.searchUsername?.trim() || null,
    });
    const pagesCount = Math.ceil(totalCount / input.pageSize);
    const frontendUrl = this.config.get<string>('FRONTEND_URL');
    return {
      items: items.map((record) => toSuperadminUserListItem({ record, frontendUrl })),
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
