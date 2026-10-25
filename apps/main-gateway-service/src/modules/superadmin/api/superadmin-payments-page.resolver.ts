import { Args, Query, Resolver } from '@nestjs/graphql';
import { GetSuperadminPaymentsPageQuery } from '../application/get-superadmin-payments-page.query';
import type {
  SuperadminPaymentsInput,
  SuperadminPaymentsPage,
} from '../../../../../../libs/common/types/superadmin-payments-list';
@Resolver()
export class SuperadminPaymentsPageResolver {
  constructor(private readonly payments: GetSuperadminPaymentsPageQuery) {}
  @Query('superadminPayments')
  async page(@Args('input') input: SuperadminPaymentsInput): Promise<SuperadminPaymentsPage> {
    const page = await this.payments.execute(input);
    return {
      ...page,
      items: page.items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
    };
  }
}
