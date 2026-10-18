import { Injectable } from '@nestjs/common';
import type { SuperadminUser } from '../../../../../../../libs/common/types/superadmin-users';
import { SuperadminUsersQueryRepository } from '../../domain/interfaces/superadmin-users.query-repository';
import { toSuperadminUserListItem } from './superadmin-user.mapper';

@Injectable()
export class GetSuperadminUserQuery {
  constructor(private readonly repository: SuperadminUsersQueryRepository) {}

  async execute(input: { userId: string }): Promise<SuperadminUser | null> {
    const record = await this.repository.findUser(input);
    return record ? { ...toSuperadminUserListItem(record), avatarUrl: record.avatarUrl } : null;
  }
}
