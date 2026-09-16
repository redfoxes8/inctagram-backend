import { Injectable } from '@nestjs/common';

import { PaymentNotificationType } from '../../../../../../../libs/contracts/src/events/notification-events-v1.event';
import { PaymentNotificationBusinessKeyFactory } from '../../domain/payment-notification-business-key.factory';
import {
  IPaymentNotificationScheduleRepository,
  PendingPaymentNotificationSchedule,
  PaymentNotificationScheduleDuplicateConstraintError,
} from '../../domain/interfaces/payment-notification-schedule.repository.interface';

const AGGREGATION_DELAY_MILLISECONDS = 30_000;

export type StagePaidAccessNotificationInput = Readonly<{
  userId: string;
  trigger: 'INITIAL_PURCHASE' | 'ADDITIONAL_PURCHASE';
  sourceTransactionId: string;
  sourceSubscriptionId: string;
  effectiveAt: Date;
  contiguousPaidEndsAt: Date;
  now: Date;
}>;

export type StagePaidAccessNotificationResult = Readonly<{
  outcome: 'CREATED' | 'MERGED' | 'DUPLICATE';
  schedule: PendingPaymentNotificationSchedule;
}>;

@Injectable()
export class StagePaidAccessNotificationService {
  public async stage(
    input: StagePaidAccessNotificationInput,
    schedules: IPaymentNotificationScheduleRepository,
  ): Promise<StagePaidAccessNotificationResult> {
    const existingSource = await schedules.findBySourceTransactionId(input.sourceTransactionId);
    if (existingSource) return { outcome: 'DUPLICATE', schedule: existingSource };

    const pendingActivation = await schedules.findPendingByUserAndType(
      input.userId,
      PaymentNotificationType.SUBSCRIPTION_ACTIVATED,
    );
    if (input.trigger === 'ADDITIONAL_PURCHASE' && pendingActivation) {
      return this.merge(input, schedules, pendingActivation);
    }

    const notificationType =
      input.trigger === 'INITIAL_PURCHASE'
        ? PaymentNotificationType.SUBSCRIPTION_ACTIVATED
        : PaymentNotificationType.SUBSCRIPTION_EXTENDED;
    const pendingSameType = await schedules.findPendingByUserAndType(
      input.userId,
      notificationType,
    );
    if (pendingSameType) return this.merge(input, schedules, pendingSameType);

    const businessKey =
      notificationType === PaymentNotificationType.SUBSCRIPTION_ACTIVATED
        ? PaymentNotificationBusinessKeyFactory.subscriptionActivated({
            userId: input.userId,
            subscriptionId: input.sourceSubscriptionId,
            effectiveAt: input.effectiveAt,
          })
        : PaymentNotificationBusinessKeyFactory.subscriptionExtended({
            userId: input.userId,
            subscriptionId: input.sourceSubscriptionId,
            effectiveAt: input.effectiveAt,
          });
    try {
      const schedule = await schedules.create({
        userId: input.userId,
        notificationType,
        businessKey,
        sourceTransactionId: input.sourceTransactionId,
        sourceSubscriptionId: input.sourceSubscriptionId,
        effectiveAt: input.effectiveAt,
        subscriptionEndsAt: input.contiguousPaidEndsAt,
        dueAt: new Date(input.now.getTime() + AGGREGATION_DELAY_MILLISECONDS),
      });
      return { outcome: 'CREATED', schedule };
    } catch (error: unknown) {
      if (!(error instanceof PaymentNotificationScheduleDuplicateConstraintError)) throw error;
      const duplicateSource = await schedules.findBySourceTransactionId(input.sourceTransactionId);
      if (duplicateSource) return { outcome: 'DUPLICATE', schedule: duplicateSource };
      const concurrentSchedule = await schedules.findPendingByUserAndType(
        input.userId,
        notificationType,
      );
      if (!concurrentSchedule) throw error;
      return this.merge(input, schedules, concurrentSchedule);
    }
  }

  private async merge(
    input: StagePaidAccessNotificationInput,
    schedules: IPaymentNotificationScheduleRepository,
    schedule: PendingPaymentNotificationSchedule,
  ): Promise<StagePaidAccessNotificationResult> {
    const subscriptionEndsAt =
      !schedule.subscriptionEndsAt ||
      schedule.subscriptionEndsAt.getTime() < input.contiguousPaidEndsAt.getTime()
        ? input.contiguousPaidEndsAt
        : schedule.subscriptionEndsAt;
    try {
      const merged = await schedules.mergePaidHorizon({
        scheduleId: schedule.id,
        sourceTransactionId: input.sourceTransactionId,
        subscriptionEndsAt,
      });
      return { outcome: 'MERGED', schedule: merged };
    } catch (error: unknown) {
      if (!(error instanceof PaymentNotificationScheduleDuplicateConstraintError)) throw error;
      const duplicateSource = await schedules.findBySourceTransactionId(input.sourceTransactionId);
      if (!duplicateSource) throw error;
      return { outcome: 'DUPLICATE', schedule: duplicateSource };
    }
  }
}
