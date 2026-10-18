import { Args, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { PaginationInput } from '../../../../../../libs/common/src/graphql/pagination-input';
import type { SuperadminUser } from '../../../../../../libs/common/types/superadmin-users';
import type { SuperadminPaymentConnection } from '../../../../../../libs/common/types/superadmin-payments';
import { GetSuperadminPaymentsQuery } from '../application/get-superadmin-payments.query';

@Resolver('SuperadminUser')
export class SuperadminPaymentsResolver {
  constructor(private readonly payments: GetSuperadminPaymentsQuery) {}

  @ResolveField('payments')
  history(
    @Parent() user: SuperadminUser,
    @Args('input') input: PaginationInput,
  ): Promise<SuperadminPaymentConnection> {
    return this.payments.execute({
      userId: user.userId,
      page: input.page,
      pageSize: input.pageSize,
    });
  }
}
