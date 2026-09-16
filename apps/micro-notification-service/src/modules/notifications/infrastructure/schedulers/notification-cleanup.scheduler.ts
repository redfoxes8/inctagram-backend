import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';

import { NotificationConfig } from '../../../../core/notification.config';
import { NotificationCleanupService } from '../../application/services/notification-cleanup.service';

@Injectable()
export class NotificationCleanupScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(NotificationCleanupScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private stopping = false;

  constructor(
    private readonly config: NotificationConfig,
    private readonly cleanup: NotificationCleanupService,
  ) {}

  public onApplicationBootstrap(): void {
    if (!this.config.notificationCleanupEnabled) return;
    this.timer = setInterval(() => this.tick(), 1_000);
  }

  public tick(): void {
    if (
      !this.config.notificationCleanupEnabled ||
      this.stopping ||
      this.running ||
      !this.matchesCron(new Date(), this.config.notificationCleanupCron)
    ) {
      return;
    }
    this.running = this.run().finally(() => {
      this.running = null;
    });
  }

  public async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.running) await this.running;
  }

  private async run(): Promise<void> {
    const startedAt = Date.now();
    try {
      const result = await this.cleanup.runOnce({
        retentionDays: this.config.notificationCleanupRetentionDays,
        batchSize: this.config.notificationCleanupBatchSize,
        maxBatchesPerRun: this.config.notificationCleanupMaxBatchesPerRun,
      });
      if (result.deleted > 0) {
        this.logger.log(
          JSON.stringify({
            event: 'notification.cleanup.completed',
            batches: result.batches,
            deleted: result.deleted,
            durationMs: result.durationMs,
          }),
        );
      }
    } catch (error: unknown) {
      this.logger.error(
        JSON.stringify({
          event: 'notification.cleanup.failed',
          batchesCompleted: 0,
          durationMs: Date.now() - startedAt,
          errorCode: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
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
