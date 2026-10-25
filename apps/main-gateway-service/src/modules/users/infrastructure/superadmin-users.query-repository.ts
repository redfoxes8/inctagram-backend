import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { Prisma } from '../../../core/prisma/client';
import {
  SuperadminUserSort,
  SuperadminUsersBanFilter,
  type SuperadminUsersFilter,
} from '../../../../../../libs/common/types/superadmin-users';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';
import {
  SuperadminUsersQueryRepository,
  type SuperadminUserListRecord,
  type SuperadminUserRecord,
} from '../domain/interfaces/superadmin-users.query-repository';

const SORT_ORDER: Readonly<Record<SuperadminUserSort, Prisma.Sql>> = {
  [SuperadminUserSort.UsernameAsc]: Prisma.sql`"username" ASC NULLS LAST, "userId" ASC`,
  [SuperadminUserSort.UsernameDesc]: Prisma.sql`"username" DESC NULLS LAST, "userId" DESC`,
  [SuperadminUserSort.CreatedAtAsc]: Prisma.sql`"createdAt" ASC, "userId" ASC`,
  [SuperadminUserSort.CreatedAtDesc]: Prisma.sql`"createdAt" DESC, "userId" DESC`,
};

type PageRow = {
  totalCount: number;
  userId: string | null;
  username: string | null;
  createdAt: Date | null;
  isBanned: boolean | null;
  isEmailConfirmed: boolean | null;
};

@Injectable()
export class PrismaSuperadminUsersQueryRepository extends SuperadminUsersQueryRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findPage(
    input: SuperadminUsersFilter,
  ): Promise<{ items: SuperadminUserListRecord[]; totalCount: number }> {
    const search = input.searchUsername
      ? Prisma.sql`AND strpos(lower(profile."username"), lower(${input.searchUsername})) > 0`
      : Prisma.empty;
    const order = SORT_ORDER[input.sort];
    let banFilter = Prisma.empty;
    if (input.banFilter === SuperadminUsersBanFilter.Blocked) {
      banFilter = Prisma.sql`AND account."isBanned" = ${true}`;
    } else if (input.banFilter === SuperadminUsersBanFilter.NotBlocked) {
      banFilter = Prisma.sql`AND account."isBanned" = ${false}`;
    }
    // All user values are parameters; only the closed enum selects static ORDER BY fragments.
    // A single statement gives filtered count and selected rows the same MVCC snapshot even in RC.
    const rows = await this.prisma.$queryRaw<PageRow[]>(Prisma.sql`
      /* superadmin users catalog */
      WITH filtered AS MATERIALIZED (
        SELECT account."id" AS "userId", profile."username", account."createdAt",
               account."isBanned", account."isConfirmed" AS "isEmailConfirmed"
        FROM "User" AS account LEFT JOIN "Profile" AS profile ON profile."userId" = account."id"
        WHERE account."deletedAt" IS NULL ${search} ${banFilter}
      ), selected AS (
        SELECT * FROM filtered ORDER BY ${order}
        LIMIT ${input.pageSize} OFFSET ${(input.page - 1) * input.pageSize}
      )
      SELECT (SELECT count(*)::integer FROM filtered) AS "totalCount", selected.*
      FROM (SELECT 1) AS seed LEFT JOIN selected ON true
      ORDER BY ${order}
    `);
    const items: SuperadminUserListRecord[] = [];
    for (const row of rows) {
      if (row.userId === null) continue; // LEFT JOIN sentinel retains count on an empty/out-of-range page.
      if (row.createdAt === null || row.isBanned === null || row.isEmailConfirmed === null) {
        throw new DomainException({
          code: DomainExceptionCode.InternalServerError,
          message: 'Invalid catalogue read model',
        });
      }
      items.push({
        userId: row.userId,
        username: row.username,
        createdAt: row.createdAt,
        isBanned: row.isBanned,
        isEmailConfirmed: row.isEmailConfirmed,
      });
    }
    return { items, totalCount: rows[0].totalCount };
  }

  async findUser(input: { userId: string }): Promise<SuperadminUserRecord | null> {
    const rows = await this.prisma.$queryRaw<SuperadminUserRecord[]>`
      SELECT account."id" AS "userId", profile."username", profile."avatarUrl", account."createdAt",
             account."isBanned", account."isConfirmed" AS "isEmailConfirmed"
      FROM "User" AS account LEFT JOIN "Profile" AS profile ON profile."userId" = account."id"
      WHERE account."id" = ${input.userId} AND account."deletedAt" IS NULL
    `;
    return rows[0] ?? null;
  }
}
