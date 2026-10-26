import { Args, Context, Query, Resolver, Subscription } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';
import { GetSuperadminPostsQuery } from '../application/get-superadmin-posts.query';
import { SuperadminPostSubscription } from './superadmin-post-subscription';
import type { SuperadminContext } from './superadmin-context';
import type {
  SuperadminPostsInput,
  SuperadminPostsPage,
  SuperadminPostSubscriptionEvent,
} from '../../../../../../libs/common/types/superadmin-posts';

@Resolver()
export class SuperadminPostsResolver {
  constructor(
    private readonly posts: GetSuperadminPostsQuery,
    private readonly subscriptions: SuperadminPostSubscription,
  ) {}
  @Query('superadminPosts')
  page(@Args('input') input: SuperadminPostsInput): Promise<SuperadminPostsPage> {
    return this.posts.execute(input);
  }
  @Subscription('superadminPostPublished', {
    resolve: (event: SuperadminPostSubscriptionEvent): SuperadminPostSubscriptionEvent => event,
  })
  published(
    @Args('input') input: { searchUsername?: string | null },
    @Context() context: SuperadminContext,
  ): Promise<AsyncIterableIterator<SuperadminPostSubscriptionEvent>> {
    if (context.transport !== 'ws')
      throw new GraphQLError('Access denied', { extensions: { code: 'FORBIDDEN' } });
    return this.subscriptions.create({ ...input, context });
  }
}
