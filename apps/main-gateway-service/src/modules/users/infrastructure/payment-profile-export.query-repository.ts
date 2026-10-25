import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { IPaymentProfileExportQueryRepository } from '../application/queries/export-payment-user-profiles.query';
import {
  normalizePaymentProfileExportPage,
  type PaymentProfileExportPage,
  type PaymentProfileExportRequest,
} from '../../../../../../libs/contracts/src/events/payment-user-profile-export';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';

type ExportRow = {
  upper: string | null;
  invalid: boolean;
  userId: string | null;
  sourceVersion: string | null;
  username: string | null;
  profileExists: boolean;
  isDeleted: boolean;
};
@Injectable()
export class PaymentProfileExportQueryRepository extends IPaymentProfileExportQueryRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }
  async exportPage(request: PaymentProfileExportRequest): Promise<PaymentProfileExportPage> {
    // All comparisons inherit User.id's collation. The LEFT JOIN preserves empty metadata.
    const rows = await this.prisma.$queryRaw<ExportRow[]>`
      WITH boundary AS (
        SELECT COALESCE(${request.upperUserId ?? null}::text,
          (SELECT max("id") FROM "User")) AS upper
      ), checked AS (
        SELECT upper, COALESCE(${request.afterUserId ?? null}::text > upper, false) AS invalid
        FROM boundary
      )
      SELECT checked.upper, checked.invalid, page.* FROM checked
      LEFT JOIN LATERAL (
        SELECT u."id" AS "userId", u."paymentProfileVersion"::text AS "sourceVersion",
          CASE WHEN u."deletedAt" IS NULL THEN p."username" ELSE NULL END AS username,
          (p."userId" IS NOT NULL) AS "profileExists", (u."deletedAt" IS NOT NULL) AS "isDeleted"
        FROM "User" u LEFT JOIN "Profile" p ON p."userId" = u."id"
        WHERE NOT checked.invalid AND u."id" <= checked.upper
          AND (${request.afterUserId ?? null}::text IS NULL OR u."id" > ${request.afterUserId ?? null})
        ORDER BY u."id" ASC LIMIT ${request.limit + 1}
      ) page ON TRUE
      ORDER BY page."userId" ASC
    `;
    if (rows[0].invalid)
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Invalid export cursor order',
      });
    const upper = rows[0].upper ?? undefined;
    const found = rows.filter((row) => row.userId !== null);
    const items = found.slice(0, request.limit).map((row) => ({
      userId: row.userId!,
      sourceVersion: row.sourceVersion!,
      username: row.username,
      profileExists: row.profileExists,
      isDeleted: row.isDeleted,
    }));
    return normalizePaymentProfileExportPage({
      request,
      value: {
        protocolVersion: 1,
        upperUserId: upper,
        sourceEmpty: upper === undefined,
        items,
        nextAfterUserId: items.at(-1)?.userId ?? request.afterUserId,
        complete: found.length <= request.limit,
      },
    });
  }
}
