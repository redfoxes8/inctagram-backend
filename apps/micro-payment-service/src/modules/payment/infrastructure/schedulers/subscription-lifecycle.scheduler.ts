import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';

import { PaymentConfig } from '../../../../core/payment.config';
import { SubscriptionLifecycleService } from '../../application/services/subscription-lifecycle.service';

@Injectable()
export class SubscriptionLifecycleScheduler
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(SubscriptionLifecycleScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private stopping = false;

  constructor(
    private readonly config: PaymentConfig,
    private readonly lifecycle: SubscriptionLifecycleService,
  ) {}

  public onApplicationBootstrap(): void {
    if (!this.config.subscriptionLifecycleEnabled) return;
    this.timer = setInterval(() => this.tick(), 1_000);
  }

  public tick(): void {
    if (
      !this.config.subscriptionLifecycleEnabled ||
      this.stopping ||
      this.running ||
      !this.matchesCron(new Date(), this.config.subscriptionCheckCron)
    ) {
      return;
    }
    this.running = this.lifecycle
      .runBatch(this.config.subscriptionLifecycleBatchSize)
      .then(() => undefined)
      .catch(() => this.logger.error('Subscription lifecycle batch failed'))
      .finally(() => {
        this.running = null;
      });
  }

  public async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.running) await this.running;
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
