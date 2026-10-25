import { Injectable } from '@nestjs/common';
import {
  PaymentPageProfiles,
  type PaymentPageUserProfile,
} from '../domain/payment-page-profiles.port';
import type {
  SuperadminPaymentsReadPage,
  EnrichedSuperadminPaymentsPage,
} from '../../../../../../libs/common/types/superadmin-payments-list';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';

export function enrichSuperadminPaymentsPage(input: {
  page: SuperadminPaymentsReadPage;
  profiles: PaymentPageUserProfile[];
}): EnrichedSuperadminPaymentsPage {
  const users = new Map(input.profiles.map((profile) => [profile.userId, profile]));
  return {
    ...input.page,
    items: input.page.items.map((item) => {
      const { userSnapshot, ...facts } = item;
      const user = users.get(item.userId);
      if (!user || user.deletedAt !== null) return { ...facts, username: null, avatarUrl: null };
      if (!userSnapshot)
        throw new DomainException({
          code: DomainExceptionCode.ServiceUnavailable,
          message: 'Payment user projection is incomplete',
        });
      // Keep the name used for global search/order; enrichment cannot fix stale search/count.
      return {
        ...facts,
        username: userSnapshot.username,
        avatarUrl: user.profileExists ? user.avatarUrl : null,
      };
    }),
  };
}

@Injectable()
export class EnrichSuperadminPaymentsPageQuery {
  constructor(private readonly profiles: PaymentPageProfiles) {}
  async execute(page: SuperadminPaymentsReadPage): Promise<EnrichedSuperadminPaymentsPage> {
    const profiles = await this.profiles.findProfiles([
      ...new Set(page.items.map((item) => item.userId)),
    ]);
    return enrichSuperadminPaymentsPage({ page, profiles });
  }
}
