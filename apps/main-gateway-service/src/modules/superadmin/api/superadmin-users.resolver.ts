import { Args, Query, Resolver } from '@nestjs/graphql';
import type {
  SuperadminUser,
  SuperadminUsersPage,
} from '../../../../../../libs/common/types/superadmin-users';
import { GetSuperadminUsersQuery } from '../../users/application/queries/get-superadmin-users.query';
import { GetSuperadminUserQuery } from '../../users/application/queries/get-superadmin-user.query';
import { SuperadminUserArgs, SuperadminUsersInput } from './superadmin-users.input';

@Resolver()
export class SuperadminUsersResolver {
  constructor(
    private readonly users: GetSuperadminUsersQuery,
    private readonly user: GetSuperadminUserQuery,
  ) {}

  @Query('superadminUsers')
  list(@Args('input') input: SuperadminUsersInput): Promise<SuperadminUsersPage> {
    return this.users.execute(input);
  }

  @Query('superadminUser')
  detail(@Args() input: SuperadminUserArgs): Promise<SuperadminUser | null> {
    return this.user.execute(input);
  }
}
