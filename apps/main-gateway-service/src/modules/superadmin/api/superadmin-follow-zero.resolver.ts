import { Args, ResolveField, Resolver } from '@nestjs/graphql';
import { PaginationInput } from '../../../../../../libs/common/src/graphql/pagination-input';
import type { SuperadminFollowConnection } from '../../../../../../libs/common/types/superadmin-follow-zero';
import { getTemporaryFollowZero } from '../application/get-temporary-follow-zero';

@Resolver('SuperadminUser')
export class SuperadminFollowZeroResolver {
  @ResolveField('followers')
  followers(@Args('input') input: PaginationInput): SuperadminFollowConnection {
    return getTemporaryFollowZero(input);
  }

  @ResolveField('following')
  following(@Args('input') input: PaginationInput): SuperadminFollowConnection {
    return getTemporaryFollowZero(input);
  }
}
