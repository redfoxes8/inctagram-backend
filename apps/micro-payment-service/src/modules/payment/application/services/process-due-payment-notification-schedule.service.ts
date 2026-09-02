import { Injectable } from '@nestjs/common';

import { PaymentNotificationEventFactory } from '../../domain/payment-notification-event.factory';
import { SubscriptionStatus } from '../../domain/enums/subscription-status.enum';
import { IPaymentUnitOfWork } from '../ports/payment-unit-of-work.port';
import { PaymentOutboxRelayService } from '../../infrastructure/messaging/payment-outbox-relay.service';

type ProcessScheduleTransactionResult =
  | 'NOOP'
  | 'NOT_FOUND'
  | Readonly<{ status: 'COMPLETED'; outboxEventId: string }>;

@Injectable()
export class ProcessDuePaymentNotificationScheduleService {
  constructor(
    private readonly unitOfWork: IPaymentUnitOfWork,
    private readonly eventFactory: PaymentNotificationEventFactory,
    private readonly outboxRelay: PaymentOutboxRelayService,
  ) {}

  public async process(scheduleId: string): Promise<'COMPLETED' | 'NOOP' | 'NOT_FOUND'> {
    const result = await this.unitOfWork.execute<ProcessScheduleTransactionResult>(
      async (context) => {
        const now = await context.databaseNow();
        const schedule = await context.notificationSchedules.findById(scheduleId);
        if (!schedule) return 'NOT_FOUND';
        if (!(await context.notificationSchedules.claim(scheduleId, now))) return 'NOOP';
        await context.lockUser(schedule.userId);
        const periods = await context.subscriptions.findOrderedUnfinishedByUserId(schedule.userId);
        const active = periods.find(
          (period) =>
            period.getStatus() === SubscriptionStatus.ACTIVE &&
            period.getStartsAt().getTime() <= now.getTime() &&
            now.getTime() < period.getEndsAt().getTime(),
        );
        if (!active) {
          await context.notificationSchedules.cancel(scheduleId);
          return 'NOOP';
        }
        let horizon = active.getEndsAt();
        for (const period of periods) {
          if (
            period.getStatus() !== SubscriptionStatus.QUEUED ||
            period.getStartsAt().getTime() > horizon.getTime()
          )
            continue;
          if (period.getEndsAt().getTime() > horizon.getTime()) horizon = period.getEndsAt();
        }
        const event = this.eventFactory.create({
          occurredAt: now,
          aggregateType: 'SUBSCRIPTION',
          aggregateId: schedule.sourceSubscriptionId ?? active.id,
          payload: {
            type: schedule.notificationType,
            userId: schedule.userId,
            businessKey: schedule.businessKey,
            subscriptionId: schedule.sourceSubscriptionId,
            providerInvoiceId: null,
            effectiveAt: schedule.effectiveAt.toISOString(),
            subscriptionEndsAt: horizon.toISOString(),
            reasonCode: null,
          },
        });
        await context.outbox.write(event);
        await context.notificationSchedules.complete(scheduleId, horizon);
        return { status: 'COMPLETED' as const, outboxEventId: event.eventId };
      },
    );
    if (result === 'NOOP' || result === 'NOT_FOUND') return result;
    await this.outboxRelay.publishById(result.outboxEventId).catch(() => undefined);
    return result.status;
  }
}
