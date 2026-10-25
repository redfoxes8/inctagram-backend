import { Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { PaymentConfig } from '../../../../core/payment.config';
import { PaymentProfileBootstrapService } from '../../application/services/payment-profile-bootstrap.service';

@Injectable()
export class PaymentProfileBootstrapWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentProfileBootstrapWorker.name);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inflight: Promise<void> | null = null;
  private stopped = false;
  constructor(
    private readonly config: PaymentConfig,
    private readonly bootstrap: PaymentProfileBootstrapService,
  ) {}
  onModuleInit(): void {
    if (this.config.userProjectionSyncEnabled) this.schedule();
  }
  private schedule(delayMs = 1000): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      let nextDelay = 1000;
      this.inflight = this.bootstrap
        .runOnce()
        .catch(() => {
          nextDelay = 30000;
          this.logger.warn({ event: 'payment.profile.bootstrap', code: 'SYNC_UNAVAILABLE' });
        })
        .finally(() => {
          this.inflight = null;
          this.schedule(nextDelay);
        });
    }, delayMs);
    this.timer.unref();
  }
  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.inflight;
  }
}
