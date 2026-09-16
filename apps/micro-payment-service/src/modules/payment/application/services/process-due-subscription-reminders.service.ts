import { Injectable } from '@nestjs/common';
import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { PaymentNotificationType } from '../../../../../../../libs/contracts/src/events/notification-events-v1.event';
import { PaymentNotificationEventFactory } from '../../domain/payment-notification-event.factory';
import { SubscriptionReminderNotificationType } from '../../domain/enums/subscription-reminder-notification-type.enum';
import { ClaimedDueReminder } from '../../domain/interfaces/subscription-reminder.repository.interface';
import { IPaymentUnitOfWork } from '../ports/payment-unit-of-work.port';

export type ProcessDueSubscriptionRemindersResult = Readonly<{
  candidates: number;
  locked: number;
  claimed: number;
  completed: number;
  suppressed: number;
  deferred: number;
  outboxCreated: number;
}>;
@Injectable()
export class ProcessDueSubscriptionRemindersService {
  constructor(
    private readonly unitOfWork: IPaymentUnitOfWork,
    private readonly events: PaymentNotificationEventFactory,
  ) {}
  public async runOnce(batchSize = 20): Promise<ProcessDueSubscriptionRemindersResult> {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100)
      throw new Error('Invalid reminder batch size');
    return this.unitOfWork.execute(async (context) => {
      const candidates = await context.subscriptionReminders.findDueCandidates(batchSize);
      if (!candidates.length)
        return {
          candidates: 0,
          locked: 0,
          claimed: 0,
          completed: 0,
          suppressed: 0,
          deferred: 0,
          outboxCreated: 0,
        };
      await context.lockUsers(candidates.map((candidate) => candidate.userId));
      const ids = await context.subscriptionReminders.claimDue(
        candidates.map((candidate) => candidate.id),
      );
      const now = await context.databaseNow();
      const reminders = await context.subscriptionReminders.loadClaimed(ids);
      const eligible = reminders.filter((reminder) => this.classify(reminder) === 'ELIGIBLE');
      const suppressedReminders = reminders.filter(
        (reminder) => this.classify(reminder) === 'SUPPRESSED',
      );
      const events = eligible.map((reminder) =>
        this.events.create({
          occurredAt: now,
          aggregateType: 'SUBSCRIPTION',
          aggregateId: reminder.subscriptionId,
          payload: {
            type:
              reminder.notificationType === SubscriptionReminderNotificationType.UPCOMING_PAYMENT
                ? PaymentNotificationType.UPCOMING_PAYMENT
                : PaymentNotificationType.SUBSCRIPTION_EXPIRING,
            userId: reminder.userId,
            businessKey: `v1:${reminder.notificationType}:${reminder.subscriptionId}:${reminder.subscriptionEndsAt.toISOString()}:${reminder.leadDays}`,
            subscriptionId: reminder.subscriptionId,
            providerInvoiceId: null,
            effectiveAt: reminder.subscriptionEndsAt.toISOString(),
            subscriptionEndsAt: reminder.subscriptionEndsAt.toISOString(),
            reasonCode: null,
          },
        }),
      );
      const outboxCreated = await context.outbox.writeMany(events);
      if (outboxCreated !== eligible.length) throw this.invariant();
      const completed = await context.subscriptionReminders.complete(
        eligible.map((reminder) => reminder.id),
        now,
      );
      const suppressed = await context.subscriptionReminders.suppress(
        suppressedReminders.map((reminder) => reminder.id),
        now,
      );
      if (completed !== eligible.length || suppressed !== suppressedReminders.length)
        throw this.invariant();
      return {
        candidates: candidates.length,
        locked: candidates.length,
        claimed: ids.length,
        completed,
        suppressed,
        deferred: ids.length - eligible.length - suppressedReminders.length,
        outboxCreated,
      };
    });
  }
  private invariant(): DomainException {
    return new DomainException({
      code: DomainExceptionCode.InternalServerError,
      message: 'Reminder terminal transition invariant failed',
    });
  }
  private classify(reminder: ClaimedDueReminder): 'ELIGIBLE' | 'SUPPRESSED' | 'DEFERRED' {
    if (reminder.ownerStatus === 'QUEUED') return 'DEFERRED';
    if (reminder.ownerStatus !== 'ACTIVE') return 'SUPPRESSED';
    if (reminder.ownerEndsAt.getTime() !== reminder.subscriptionEndsAt.getTime())
      return 'SUPPRESSED';
    if (reminder.ownerAutoRenew !== reminder.expectedAutoRenew) return 'SUPPRESSED';
    if (reminder.hasSuppressingSuccessor) return 'SUPPRESSED';
    return (reminder.ownerAutoRenew &&
      reminder.notificationType === SubscriptionReminderNotificationType.UPCOMING_PAYMENT) ||
      (!reminder.ownerAutoRenew &&
        reminder.notificationType === SubscriptionReminderNotificationType.SUBSCRIPTION_EXPIRING)
      ? 'ELIGIBLE'
      : 'SUPPRESSED';
  }
}
