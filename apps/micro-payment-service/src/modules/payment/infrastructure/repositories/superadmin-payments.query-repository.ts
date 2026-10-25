import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../core/prisma/client';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { PaymentConfig } from '../../../../core/payment.config';
import { ISuperadminPaymentsQueryPort } from '../../application/ports/superadmin-payments-query.port';
import { BillingInterval } from '../../domain/enums/billing-interval.enum';
import { PaymentTransactionStatus } from '../../domain/enums/payment-transaction-status.enum';
import {
  SUPERADMIN_PAYMENTS_PAGE_SIZE,
  SuperadminPaymentsSort,
  type SuperadminPaymentsFilter,
  type SuperadminPaymentRecord,
} from '../../../../../../../libs/common/types/superadmin-payments-list';
import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { normalizePaymentUserProfileSnapshot } from '../../../../../../../libs/contracts/src/events/payment-user-profile-snapshot';

const ORDER: Readonly<Record<SuperadminPaymentsSort, Prisma.Sql>> = {
  [SuperadminPaymentsSort.UsernameAsc]: Prisma.sql`"username" ASC NULLS LAST, "transactionId" ASC`,
  [SuperadminPaymentsSort.UsernameDesc]: Prisma.sql`"username" DESC NULLS LAST, "transactionId" DESC`,
  [SuperadminPaymentsSort.CreatedAtAsc]: Prisma.sql`"createdAt" ASC, "transactionId" ASC`,
  [SuperadminPaymentsSort.CreatedAtDesc]: Prisma.sql`"createdAt" DESC, "transactionId" DESC`,
  [SuperadminPaymentsSort.AmountAsc]: Prisma.sql`"amountMinor" ASC, "transactionId" ASC`,
  [SuperadminPaymentsSort.AmountDesc]: Prisma.sql`"amountMinor" DESC, "transactionId" DESC`,
  [SuperadminPaymentsSort.PaymentMethodAsc]: Prisma.sql`"provider" ASC, "transactionId" ASC`,
  [SuperadminPaymentsSort.PaymentMethodDesc]: Prisma.sql`"provider" DESC, "transactionId" DESC`,
};
type Scalars = Omit<
  SuperadminPaymentRecord,
  'userSnapshot' | 'provider' | 'status' | 'billingInterval'
> & {
  provider: string;
  status: string;
  billingInterval: string;
  projectedUserId: string;
  sourceVersion: bigint;
  profileExists: boolean;
  isDeleted: boolean;
  username: string;
};
type PaymentRow = { [Key in keyof Scalars]: Scalars[Key] | null } & {
  ready: boolean;
  totalCount: bigint;
};

@Injectable()
export class SuperadminPaymentsQueryRepository extends ISuperadminPaymentsQueryPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: PaymentConfig,
  ) {
    super();
  }

  async findPage(
    filter: SuperadminPaymentsFilter,
  ): Promise<{ items: SuperadminPaymentRecord[]; totalCount: number }> {
    if (!this.config.userProjectionSyncEnabled) throw this.unavailable();
    const order = Object.hasOwn(ORDER, filter.sort) ? ORDER[filter.sort] : undefined;
    if (!order)
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Invalid payments sort',
      });
    const search =
      filter.searchUsername === null
        ? Prisma.empty
        : Prisma.sql`WHERE strpos(lower("username"), lower(${filter.searchUsername})) > 0`;
    const rows = await this.prisma
      .$queryRaw<PaymentRow[]>(
        Prisma.sql`
      /* superadmin payments page: readiness, count and items share one MVCC snapshot */
      WITH sync AS MATERIALIZED (
        SELECT EXISTS(SELECT 1 FROM "admin_user_projection_sync"
          WHERE "id" = 'payment-user-profile-v1' AND "phase" = 'READY') AS ready
      ), facts AS (
        SELECT payment."id" AS "transactionId", payment."user_id" AS "userId",
          payment."created_at" AS "createdAt", payment."amount_minor" AS "amountMinor",
          payment."currency", payment."provider", payment."status",
          product."name" AS "productName", product."billing_interval" AS "billingInterval",
          product."billing_interval_count" AS "billingIntervalCount",
          profile."user_id" AS "projectedUserId", profile."source_version" AS "sourceVersion",
          profile."profile_exists" AS "profileExists", profile."is_deleted" AS "isDeleted",
          CASE WHEN profile."is_deleted" OR NOT profile."profile_exists" THEN NULL ELSE profile."username" END AS "username"
        FROM "payment_transactions" payment
        JOIN "products" product ON product."id" = payment."product_id"
        LEFT JOIN "admin_user_profile_read_model" profile ON profile."user_id" = payment."user_id"::text
        CROSS JOIN sync WHERE sync.ready
      ), filtered AS MATERIALIZED (
        SELECT * FROM facts ${search}
      ), selected AS (
        SELECT * FROM filtered ORDER BY ${order}
        LIMIT ${SUPERADMIN_PAYMENTS_PAGE_SIZE} OFFSET ${(filter.page - 1) * SUPERADMIN_PAYMENTS_PAGE_SIZE}
      )
      SELECT sync.ready, (SELECT count(*) FROM filtered) AS "totalCount", selected.*
      FROM sync LEFT JOIN selected ON true ORDER BY ${order}
    `,
      )
      .catch(() => {
        throw this.unavailable();
      });
    if (!rows[0]?.ready) throw this.unavailable();
    const count = rows[0].totalCount;
    if (count < 0n || count > 2147483647n) throw this.invalidReadModel();
    return {
      totalCount: Number(count),
      items: rows.filter((row) => row.transactionId !== null).map((row) => this.toRecord(row)),
    };
  }

  private toRecord(row: PaymentRow): SuperadminPaymentRecord {
    if (
      !row.transactionId ||
      !row.userId ||
      !(row.createdAt instanceof Date) ||
      !Number.isFinite(row.createdAt.getTime()) ||
      row.amountMinor === null ||
      !Number.isInteger(row.amountMinor) ||
      row.amountMinor < -2147483648 ||
      row.amountMinor > 2147483647 ||
      !row.currency ||
      !row.productName ||
      row.billingIntervalCount === null ||
      row.billingIntervalCount < 1 ||
      (row.provider !== 'STRIPE' && row.provider !== 'PAYPAL') ||
      !Object.values(BillingInterval).includes(row.billingInterval as BillingInterval) ||
      !Object.values(PaymentTransactionStatus).includes(row.status as PaymentTransactionStatus)
    )
      throw this.invalidReadModel();
    let userSnapshot: SuperadminPaymentRecord['userSnapshot'] = null;
    if (row.projectedUserId !== null) {
      try {
        userSnapshot = normalizePaymentUserProfileSnapshot({
          userId: row.projectedUserId,
          sourceVersion: row.sourceVersion?.toString(),
          username: row.username,
          profileExists: row.profileExists,
          isDeleted: row.isDeleted,
        });
      } catch {
        throw this.invalidReadModel();
      }
    }
    return {
      transactionId: row.transactionId,
      userId: row.userId,
      createdAt: row.createdAt,
      amountMinor: row.amountMinor,
      currency: row.currency,
      productName: row.productName,
      billingInterval: row.billingInterval as BillingInterval,
      billingIntervalCount: row.billingIntervalCount,
      provider: row.provider,
      status: row.status as PaymentTransactionStatus,
      userSnapshot,
    };
  }
  private unavailable(): DomainException {
    return new DomainException({
      code: DomainExceptionCode.ServiceUnavailable,
      message: 'Payment user projection unavailable',
    });
  }
  private invalidReadModel(): DomainException {
    return new DomainException({
      code: DomainExceptionCode.InternalServerError,
      message: 'Invalid superadmin payments read model',
    });
  }
}
