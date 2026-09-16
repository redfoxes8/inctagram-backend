import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';

import { PaymentConfig } from '../../../../core/payment.config';
import { PaymentNotificationRecoveryService } from '../../application/services/payment-notification-recovery.service';

@Injectable()
export class PaymentNotificationRecoveryScheduler
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(PaymentNotificationRecoveryScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private lastRunMinute = -1;

  constructor(
    private readonly config: PaymentConfig,
    private readonly recovery: PaymentNotificationRecoveryService,
  ) {}

  public onApplicationBootstrap(): void {
    if (!this.config.paymentNotificationRecoveryEnabled) return;
    this.timer = setInterval(() => void this.tick(), 60_000);
  }

  public onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    const now = new Date();
    const currentMinute = Math.floor(now.getTime() / 60_000);
    if (now.getUTCMinutes() % 20 !== 0 || this.lastRunMinute === currentMinute) return;
    this.lastRunMinute = currentMinute;
    const result = await this.recovery.runOnce(now);
    if (result.claimed > 0 || result.failed > 0) this.logger.log(result);
  }
}
