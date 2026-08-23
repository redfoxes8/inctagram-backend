import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import {
  PAYMENT_INTEGRATION_AGGREGATE_TYPE,
  PAYMENT_INTEGRATION_EVENT_TYPE,
  PAYMENT_INTEGRATION_EVENT_VERSION,
  SUBSCRIPTION_ACTIVATED_ROUTING_KEY,
  SubscriptionActivatedV1,
  SubscriptionExpiredV1,
} from '../../../../../../../libs/contracts/src/events/payment-integration-events-v1.event';
import { SubscriptionEntity } from '../../domain/entities/subscription.entity';
import { SubscriptionStatus } from '../../domain/enums/subscription-status.enum';
import { IPaymentUnitOfWork, PaymentUnitOfWorkContext } from '../ports/payment-unit-of-work.port';

@Injectable()
export class SubscriptionLifecycleService {
  constructor(private readonly unitOfWork: IPaymentUnitOfWork) {}

  public runBatch(batchSize: number): Promise<number> {
    return this.unitOfWork.execute(async (context) => {
      const now = await context.databaseNow();
      const claimed = await context.subscriptions.claimDueActive({ dueAt: now, limit: batchSize });
      const claimedUsers = new Set<string>();
      for (const candidate of claimed) {
        if (claimedUsers.has(candidate.getUserId())) {
          throw this.conflict('Subscription lifecycle claim contains a duplicate user');
        }
        claimedUsers.add(candidate.getUserId());
        await this.advanceUserQueue(context, candidate, now);
      }
      return claimed.length;
    });
  }

  private async advanceUserQueue(
    context: PaymentUnitOfWorkContext,
    candidate: SubscriptionEntity,
    now: Date,
  ): Promise<void> {
    await context.lockUser(candidate.getUserId());
    const queue = await context.subscriptions.findOrderedUnfinishedByUserId(candidate.getUserId());
    const activeSubscriptions = queue.filter(
      (subscription) => subscription.getStatus() === SubscriptionStatus.ACTIVE,
    );
    if (activeSubscriptions.length !== 1 || activeSubscriptions[0].id !== candidate.id) {
      throw this.conflict('Claimed subscription is not the unique active period');
    }
    const active = activeSubscriptions[0];
    const queued = queue.filter(
      (subscription) => subscription.getStatus() === SubscriptionStatus.QUEUED,
    );
    const replacement = queued[0] ?? null;
    this.assertReplacement(active, replacement, now);

    active.expire(now);
    if (replacement) replacement.activateQueued(now);
    await context.subscriptions.save(active);
    if (replacement) await context.subscriptions.save(replacement);
    await context.outbox.write(this.expiredEvent(active, replacement, now));
    if (replacement) await context.outbox.write(this.activatedEvent(replacement, now));
  }

  private assertReplacement(
    active: SubscriptionEntity,
    replacement: SubscriptionEntity | null,
    now: Date,
  ): void {
    if (!replacement) return;
    if (
      replacement.getSequence() !== active.getSequence() + 1 ||
      replacement.getStartsAt().getTime() !== active.getEndsAt().getTime()
    ) {
      throw this.conflict('Paid subscription queue head is not contiguous');
    }
    if (now.getTime() >= replacement.getEndsAt().getTime()) {
      throw this.conflict('Paid subscription queue head is already outside its period');
    }
  }

  private expiredEvent(
    expired: SubscriptionEntity,
    replacement: SubscriptionEntity | null,
    occurredAt: Date,
  ): SubscriptionExpiredV1 {
    return {
      eventId: randomUUID(),
      version: PAYMENT_INTEGRATION_EVENT_VERSION,
      eventType: PAYMENT_INTEGRATION_EVENT_TYPE.SUBSCRIPTION_EXPIRED,
      occurredAt: occurredAt.toISOString(),
      aggregateType: PAYMENT_INTEGRATION_AGGREGATE_TYPE.SUBSCRIPTION,
      aggregateId: expired.id,
      routingKey: 'payment.subscription.expired',
      payload: {
        userId: expired.getUserId(),
        subscriptionId: expired.id,
        subscriptionSequence: expired.getSequence(),
        endsAt: expired.getEndsAt().toISOString(),
        hasActiveReplacement: replacement !== null,
        replacementSubscriptionId: replacement?.id ?? null,
      },
    };
  }

  private activatedEvent(activated: SubscriptionEntity, occurredAt: Date): SubscriptionActivatedV1 {
    return {
      eventId: randomUUID(),
      version: PAYMENT_INTEGRATION_EVENT_VERSION,
      eventType: PAYMENT_INTEGRATION_EVENT_TYPE.SUBSCRIPTION_ACTIVATED,
      occurredAt: occurredAt.toISOString(),
      aggregateType: PAYMENT_INTEGRATION_AGGREGATE_TYPE.SUBSCRIPTION,
      aggregateId: activated.id,
      routingKey: SUBSCRIPTION_ACTIVATED_ROUTING_KEY,
      payload: {
        userId: activated.getUserId(),
        subscriptionId: activated.id,
        subscriptionSequence: activated.getSequence(),
        startsAt: activated.getStartsAt().toISOString(),
        endsAt: activated.getEndsAt().toISOString(),
        productId: activated.getProductId(),
      },
    };
  }

  private conflict(message: string): DomainException {
    return new DomainException({ code: DomainExceptionCode.Conflict, message });
  }
}
