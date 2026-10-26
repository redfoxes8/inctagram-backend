import { BACKGROUND_IDLE_MS } from '../../../../../../../libs/common/src/constants/background-polling';
import { Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { PostConfig } from '../../../../core/post.config';
import { PostProfileBootstrapService } from '../../application/services/post-profile-bootstrap.service';

@Injectable()
export class PostProfileBootstrapWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PostProfileBootstrapWorker.name);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: Promise<void> | null = null;
  private stopped = false;
  private wakeRequested = false;
  private unsubscribe: (() => void) | null = null;

  private wake(): void {
    if (this.stopped) return;
    this.wakeRequested = true;
    if (this.pending) return;
    if (this.timer) clearTimeout(this.timer);
    this.schedule(1000);
    this.wakeRequested = false;
  }

  constructor(
    private readonly config: PostConfig,
    private readonly bootstrap: PostProfileBootstrapService,
  ) {}

  onModuleInit(): void {
    if (this.config.userProjectionSyncEnabled) {
      this.unsubscribe = this.bootstrap.onConsumerConnected(() => this.wake());
      this.schedule(1000);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    this.unsubscribe?.();
    this.bootstrap.stop();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.pending;
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      let nextDelay = BACKGROUND_IDLE_MS;
      this.pending = this.bootstrap
        .runOnce()
        .then((nextCheckAt) => {
          nextDelay = Math.max(
            1000,
            Math.min(BACKGROUND_IDLE_MS, nextCheckAt.getTime() - Date.now()),
          );
        })
        .catch(() => {
          nextDelay = 60000;
          this.logger.warn({ event: 'post.profile.bootstrap', code: 'SYNC_UNAVAILABLE' });
        })
        .finally(() => {
          this.pending = null;
          this.schedule(this.wakeRequested ? 1000 : nextDelay);
          this.wakeRequested = false;
        });
    }, delayMs);
    this.timer.unref();
  }
}
