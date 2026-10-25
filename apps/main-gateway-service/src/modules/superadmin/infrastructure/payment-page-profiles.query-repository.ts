import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { Prisma } from '../../../core/prisma/client';
import {
  PaymentPageProfiles,
  type PaymentPageUserProfile,
} from '../domain/payment-page-profiles.port';
import { SUPERADMIN_PAYMENTS_PAGE_SIZE } from '../../../../../../libs/common/types/superadmin-payments-list';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';

@Injectable()
export class PaymentPageProfilesQueryRepository extends PaymentPageProfiles {
  constructor(private readonly prisma: PrismaService) {
    super();
  }
  async findProfiles(userIds: string[]): Promise<PaymentPageUserProfile[]> {
    const uniqueIds = [...new Set(userIds)];
    if (
      uniqueIds.length > SUPERADMIN_PAYMENTS_PAGE_SIZE ||
      uniqueIds.some((id) => typeof id !== 'string' || !id.trim())
    ) {
      throw new DomainException({
        code: DomainExceptionCode.InternalServerError,
        message: 'Invalid payment page user batch',
      });
    }
    if (uniqueIds.length === 0) return [];
    return this.prisma
      .$queryRaw<PaymentPageUserProfile[]>(
        Prisma.sql`
      /* superadmin payment page profile batch */
      SELECT account."id" AS "userId", account."deletedAt",
        (profile."userId" IS NOT NULL) AS "profileExists", profile."avatarUrl"
      FROM "User" account LEFT JOIN "Profile" profile ON profile."userId" = account."id"
      WHERE account."id" IN (${Prisma.join(uniqueIds)})
    `,
      )
      .catch(() => {
        throw new DomainException({
          code: DomainExceptionCode.ServiceUnavailable,
          message: 'Payment profile lookup unavailable',
        });
      });
  }
}
