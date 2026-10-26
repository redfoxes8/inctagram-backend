import { Injectable } from '@nestjs/common';
import { PostPublishedDelivery } from '../application/post-published-delivery';
import { protectSuperadminIterator } from './protect-superadmin-iterator';
import type { SuperadminWsContext } from './superadmin-context';
import type { SuperadminPostSubscriptionEvent } from '../../../../../../libs/common/types/superadmin-posts';
import { GraphQLError } from 'graphql';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';

// Internal factory only. The schema-first resolver/root are deliberately left to D6b.
@Injectable()
export class SuperadminPostSubscription {
  constructor(private readonly delivery: PostPublishedDelivery) {}
  async create(input: {
    searchUsername?: string | null;
    context: SuperadminWsContext;
  }): Promise<AsyncIterableIterator<SuperadminPostSubscriptionEvent>> {
    const source = await this.delivery.subscribe({
      searchUsername: input.searchUsername,
      access: {
        onClose: (cleanup) => input.context.lifecycle.onClose(cleanup),
        unavailable: () => input.context.lifecycle.unavailable(),
        assertAuthorized: async () => {
          try {
            return await input.context.lifecycle.assertAuthorized();
          } catch (error) {
            const code =
              error instanceof GraphQLError && error.extensions.code === 'UNAUTHENTICATED'
                ? DomainExceptionCode.Unauthorized
                : DomainExceptionCode.ServiceUnavailable;
            throw new DomainException({ code, message: 'Subscription unavailable' });
          }
        },
      },
    });
    return protectSuperadminIterator({ source, context: input.context });
  }
}
