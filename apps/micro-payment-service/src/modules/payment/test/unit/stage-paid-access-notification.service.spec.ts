import { PaymentNotificationType } from '../../../../../../../libs/contracts/src/events/notification-events-v1.event';
import { StagePaidAccessNotificationService } from '../../application/services/stage-paid-access-notification.service';
import { PaymentNotificationScheduleStatus } from '../../domain/enums/payment-notification-schedule-status.enum';
import {
  CreatePaymentNotificationScheduleInput,
  IPaymentNotificationScheduleRepository,
  PendingPaymentNotificationSchedule,
} from '../../domain/interfaces/payment-notification-schedule.repository.interface';
import { PaymentNotificationBusinessKeyFactory } from '../../domain/payment-notification-business-key.factory';

class InMemoryPaymentNotificationScheduleRepository extends IPaymentNotificationScheduleRepository {
  public readonly schedules: PendingPaymentNotificationSchedule[] = [];
  private readonly schedulesBySource = new Map<string, PendingPaymentNotificationSchedule>();

  public findBySourceTransactionId(
    sourceTransactionId: string,
  ): Promise<PendingPaymentNotificationSchedule | null> {
    return Promise.resolve(this.schedulesBySource.get(sourceTransactionId) ?? null);
  }

  public findPendingByUserAndType(
    userId: string,
    notificationType: 'SUBSCRIPTION_ACTIVATED' | 'SUBSCRIPTION_EXTENDED',
  ): Promise<PendingPaymentNotificationSchedule | null> {
    return Promise.resolve(
      this.schedules.find(
        (schedule) =>
          schedule.userId === userId &&
          schedule.notificationType === notificationType &&
          schedule.status === PaymentNotificationScheduleStatus.PENDING,
      ) ?? null,
    );
  }

  public create(
    input: CreatePaymentNotificationScheduleInput,
  ): Promise<PendingPaymentNotificationSchedule> {
    const schedule: PendingPaymentNotificationSchedule = {
      id: `00000000-0000-4000-8000-${String(this.schedules.length + 1).padStart(12, '0')}`,
      userId: input.userId,
      notificationType: input.notificationType,
      businessKey: input.businessKey,
      sourceSubscriptionId: input.sourceSubscriptionId,
      effectiveAt: input.effectiveAt,
      subscriptionEndsAt: input.subscriptionEndsAt,
      dueAt: input.dueAt,
      status: PaymentNotificationScheduleStatus.PENDING,
    };
    this.schedules.push(schedule);
    this.schedulesBySource.set(input.sourceTransactionId, schedule);
    return Promise.resolve(schedule);
  }

  public mergePaidHorizon(input: {
    scheduleId: string;
    sourceTransactionId: string;
    subscriptionEndsAt: Date;
  }): Promise<PendingPaymentNotificationSchedule> {
    const schedule = this.schedules.find((candidate) => candidate.id === input.scheduleId);
    if (!schedule) throw new Error('Schedule is missing');
    const merged = { ...schedule, subscriptionEndsAt: input.subscriptionEndsAt };
    const index = this.schedules.indexOf(schedule);
    this.schedules[index] = merged;
    this.schedulesBySource.set(input.sourceTransactionId, merged);
    return Promise.resolve(merged);
  }

  public findById(id: string): Promise<PendingPaymentNotificationSchedule | null> {
    return Promise.resolve(this.schedules.find((schedule) => schedule.id === id) ?? null);
  }

  public claim(): Promise<boolean> {
    return Promise.resolve(false);
  }

  public complete(): Promise<void> {
    return Promise.resolve();
  }

  public cancel(): Promise<void> {
    return Promise.resolve();
  }
}

describe('StagePaidAccessNotificationService', () => {
  const service = new StagePaidAccessNotificationService();
  const userId = '00000000-0000-4000-8000-000000000001';
  const initialSubscriptionId = '00000000-0000-4000-8000-000000000002';

  it('creates an activation schedule at the fixed 30-second due time', async () => {
    const schedules = new InMemoryPaymentNotificationScheduleRepository();
    const now = new Date('2026-09-02T10:00:00.000Z');
    const effectiveAt = new Date('2026-09-02T10:00:00.000Z');
    const result = await service.stage(
      {
        userId,
        trigger: 'INITIAL_PURCHASE',
        sourceTransactionId: '00000000-0000-4000-8000-000000000003',
        sourceSubscriptionId: initialSubscriptionId,
        effectiveAt,
        contiguousPaidEndsAt: new Date('2026-10-02T10:00:00.000Z'),
        now,
      },
      schedules,
    );

    expect(result.outcome).toBe('CREATED');
    expect(result.schedule.notificationType).toBe(PaymentNotificationType.SUBSCRIPTION_ACTIVATED);
    expect(result.schedule.dueAt).toEqual(new Date('2026-09-02T10:00:30.000Z'));
    expect(result.schedule.businessKey).toBe(
      PaymentNotificationBusinessKeyFactory.subscriptionActivated({
        userId,
        subscriptionId: initialSubscriptionId,
        effectiveAt,
      }),
    );
  });

  it('merges an additional purchase into a pending activation without moving its due time', async () => {
    const schedules = new InMemoryPaymentNotificationScheduleRepository();
    const initialNow = new Date('2026-09-02T10:00:00.000Z');
    await service.stage(
      {
        userId,
        trigger: 'INITIAL_PURCHASE',
        sourceTransactionId: '00000000-0000-4000-8000-000000000003',
        sourceSubscriptionId: initialSubscriptionId,
        effectiveAt: initialNow,
        contiguousPaidEndsAt: new Date('2026-10-02T10:00:00.000Z'),
        now: initialNow,
      },
      schedules,
    );
    const result = await service.stage(
      {
        userId,
        trigger: 'ADDITIONAL_PURCHASE',
        sourceTransactionId: '00000000-0000-4000-8000-000000000004',
        sourceSubscriptionId: '00000000-0000-4000-8000-000000000005',
        effectiveAt: new Date('2026-10-02T10:00:00.000Z'),
        contiguousPaidEndsAt: new Date('2026-11-02T10:00:00.000Z'),
        now: new Date('2026-09-02T10:00:10.000Z'),
      },
      schedules,
    );

    expect(result.outcome).toBe('MERGED');
    expect(schedules.schedules).toHaveLength(1);
    expect(result.schedule.notificationType).toBe(PaymentNotificationType.SUBSCRIPTION_ACTIVATED);
    expect(result.schedule.dueAt).toEqual(new Date('2026-09-02T10:00:30.000Z'));
    expect(result.schedule.subscriptionEndsAt).toEqual(new Date('2026-11-02T10:00:00.000Z'));
  });

  it('creates distinct, stable invoice business keys for failure and recovery', () => {
    const providerInvoiceId = 'invoice_123';

    expect(PaymentNotificationBusinessKeyFactory.paymentFailed(providerInvoiceId)).toBe(
      PaymentNotificationBusinessKeyFactory.paymentFailed(providerInvoiceId),
    );
    expect(PaymentNotificationBusinessKeyFactory.paymentRecovered(providerInvoiceId)).toBe(
      PaymentNotificationBusinessKeyFactory.paymentRecovered(providerInvoiceId),
    );
    expect(PaymentNotificationBusinessKeyFactory.paymentFailed(providerInvoiceId)).not.toBe(
      PaymentNotificationBusinessKeyFactory.paymentRecovered(providerInvoiceId),
    );
  });
});
