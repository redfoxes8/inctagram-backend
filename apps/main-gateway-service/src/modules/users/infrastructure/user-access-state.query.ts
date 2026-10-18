import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { requireGatewayTransaction } from '../../../core/prisma/transactions/require-gateway-transaction';
import { UserAccessState } from '../../../../../../libs/common/types/user-access-state';
import { UserAccessStateQuery } from '../domain/interfaces/user-access-state.query';

@Injectable()
export class PrismaUserAccessStateQuery extends UserAccessStateQuery {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findByEmail(input: { email: string }): Promise<UserAccessState | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { isBanned: true, deletedAt: true },
    });
    if (!user) return null;
    if (user.deletedAt !== null) return UserAccessState.Deleted;
    return user.isBanned ? UserAccessState.Blocked : UserAccessState.Active;
  }

  async findByUserId(input: {
    userId: string;
    transaction?: unknown;
  }): Promise<UserAccessState | null> {
    const client =
      input.transaction === undefined ? this.prisma : requireGatewayTransaction(input.transaction);
    const user = await client.user.findUnique({
      where: { id: input.userId },
      select: { isBanned: true, deletedAt: true },
    });
    if (!user) return null;
    if (user.deletedAt !== null) return UserAccessState.Deleted;
    return user.isBanned ? UserAccessState.Blocked : UserAccessState.Active;
  }
}
