import { BACKGROUND_IDLE_MS } from '../../../../../../../libs/common/src/constants/background-polling';
import { Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { PaymentConfig } from '../../../../core/payment.config';
import { PaymentProfileBootstrapService } from '../../application/services/payment-profile-bootstrap.service';

@Injectable()
export class PaymentProfileBootstrapWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentProfileBootstrapWorker.name);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inflight: Promise<void> | null = null;
  private stopped = false;
  private wakeRequested = false;
  private unsubscribe: (() => void) | null = null;

  private wake(): void {
    if (this.stopped) return;
    this.wakeRequested = true;
    if (this.inflight) return;
    if (this.timer) clearTimeout(this.timer);
    this.schedule(1000);
    this.wakeRequested = false;
  }
  constructor(
    private readonly config: PaymentConfig,
    private readonly bootstrap: PaymentProfileBootstrapService,
  ) {}
  onModuleInit(): void {
    if (this.config.userProjectionSyncEnabled) {
      this.unsubscribe = this.bootstrap.onConsumerConnected(() => this.wake());
      this.schedule();
    }
  }
  private schedule(delayMs = 1000): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      let nextDelay = BACKGROUND_IDLE_MS;
      this.inflight = this.bootstrap
        .runOnce()
        .then((nextCheckAt) => {
          nextDelay = Math.max(
            1000,
            Math.min(BACKGROUND_IDLE_MS, nextCheckAt.getTime() - Date.now()),
          );
        })
        .catch(() => {
          nextDelay = 60000;
          this.logger.warn({ event: 'payment.profile.bootstrap', code: 'SYNC_UNAVAILABLE' });
        })
        .finally(() => {
          this.inflight = null;
          this.schedule(this.wakeRequested ? 1000 : nextDelay);
          this.wakeRequested = false;
        });
    }, delayMs);
    this.timer.unref();
  }
  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    this.unsubscribe?.();
    if (this.timer) clearTimeout(this.timer);
    await this.inflight;
  }
}
