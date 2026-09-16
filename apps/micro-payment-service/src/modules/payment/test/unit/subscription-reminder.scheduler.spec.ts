import { Logger } from '@nestjs/common';

import { SubscriptionReminderScheduler } from '../../infrastructure/schedulers/subscription-reminder.scheduler';

type SchedulerInternals = SubscriptionReminderScheduler & {
  running: Promise<void> | null;
};

function schedulerWithResult(result: Record<string, number>): SchedulerInternals {
  const config = {
    paymentReminderSchedulerEnabled: true,
    paymentReminderSchedulerCron: '* * * * * *',
    paymentReminderBatchSize: 20,
    paymentReminderMaxBatchesPerTick: 5,
  };
  const processor = { runOnce: jest.fn().mockResolvedValue(result) };
  return new SubscriptionReminderScheduler(
    config as never,
    processor as never,
  ) as SchedulerInternals;
}

const emptyResult = {
  candidates: 0,
  claimed: 0,
  completed: 0,
  suppressed: 0,
  deferred: 0,
  outboxCreated: 0,
};

describe('SubscriptionReminderScheduler markers', () => {
  it('logs created and suppressed only for non-zero aggregate counts', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const scheduler = schedulerWithResult({
      candidates: 1,
      claimed: 1,
      completed: 1,
      suppressed: 2,
      deferred: 0,
      outboxCreated: 1,
    });

    scheduler.tick();
    await scheduler.running;

    expect(log).toHaveBeenCalledWith(
      JSON.stringify({ event: 'payment.reminder.created', count: 1 }),
    );
    expect(log).toHaveBeenCalledWith(
      JSON.stringify({ event: 'payment.reminder.suppressed', count: 2 }),
    );
    log.mockRestore();
  });

  it('does not log an info marker for an empty result', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const scheduler = schedulerWithResult(emptyResult);

    scheduler.tick();
    await scheduler.running;

    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
