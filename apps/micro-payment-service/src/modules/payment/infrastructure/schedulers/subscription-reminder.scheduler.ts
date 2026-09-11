import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';

import { PaymentConfig } from '../../../../core/payment.config';
import { ProcessDueSubscriptionRemindersService } from '../../application/services/process-due-subscription-reminders.service';

const REMINDER_BATCH_FAILED = 'REMINDER_BATCH_FAILED';

@Injectable()
export class SubscriptionReminderScheduler
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(SubscriptionReminderScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private stopping = false;

  constructor(
    private readonly config: PaymentConfig,
    private readonly processor: ProcessDueSubscriptionRemindersService,
  ) {}

  public onApplicationBootstrap(): void {
    if (!this.config.paymentReminderSchedulerEnabled) return;
    this.timer = setInterval(() => this.tick(), 1_000);
  }

  public tick(): void {
    if (
      !this.config.paymentReminderSchedulerEnabled ||
      this.stopping ||
      this.running ||
      !this.matchesCron(new Date(), this.config.paymentReminderSchedulerCron)
    ) {
      return;
    }
    this.running = this.drain().finally(() => {
      this.running = null;
    });
  }

  public async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.running) await this.running;
  }

  private async drain(): Promise<void> {
    const startedAt = Date.now();
    let batches = 0;
    let candidates = 0;
    let claimed = 0;
    let completed = 0;
    let suppressed = 0;
    let deferred = 0;
    let outboxCreated = 0;
    let stoppedByLimit = true;

    try {
      for (; batches < this.config.paymentReminderMaxBatchesPerTick; batches += 1) {
        const result = await this.processor.runOnce(this.config.paymentReminderBatchSize);
        candidates += result.candidates;
        claimed += result.claimed;
        completed += result.completed;
        suppressed += result.suppressed;
        deferred += result.deferred;
        outboxCreated += result.outboxCreated;
        if (
          result.candidates < this.config.paymentReminderBatchSize ||
          result.claimed < this.config.paymentReminderBatchSize
        ) {
          stoppedByLimit = false;
          break;
        }
      }

      if (batches === 0 && candidates === 0) return;
      this.logger.log(
        JSON.stringify({
          event: 'payment.reminder.batch.completed',
          batches: Math.min(batches + 1, this.config.paymentReminderMaxBatchesPerTick),
          candidates,
          claimed,
          completed,
          suppressed,
          deferred,
          outboxCreated,
          durationMs: Date.now() - startedAt,
          stoppedByLimit,
        }),
      );
      if (outboxCreated > 0) {
        this.logger.log(
          JSON.stringify({ event: 'payment.reminder.created', count: outboxCreated }),
        );
      }
      if (suppressed > 0) {
        this.logger.log(
          JSON.stringify({ event: 'payment.reminder.suppressed', count: suppressed }),
        );
      }
    } catch {
      this.logger.error(
        JSON.stringify({
          event: 'payment.reminder.batch.failed',
          batchesCompleted: batches,
          durationMs: Date.now() - startedAt,
          errorCode: REMINDER_BATCH_FAILED,
        }),
      );
    }
  }

  private matchesCron(now: Date, expression: string): boolean {
    const fields = expression.split(/\s+/u);
    const values = [
      now.getUTCSeconds(),
      now.getUTCMinutes(),
      now.getUTCHours(),
      now.getUTCDate(),
      now.getUTCMonth() + 1,
      now.getUTCDay(),
    ];
    return (
      fields.length === values.length &&
      fields.every((field, index) => {
        if (field === '*') return true;
        if (field.startsWith('*/')) return values[index] % Number(field.slice(2)) === 0;
        return values[index] === Number(field);
      })
    );
  }
}
