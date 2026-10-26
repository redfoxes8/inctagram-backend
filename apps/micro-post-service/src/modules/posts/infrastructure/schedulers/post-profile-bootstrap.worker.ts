import { Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { PostConfig } from '../../../../core/post.config';
import { PostProfileBootstrapService } from '../../application/services/post-profile-bootstrap.service';

@Injectable()
export class PostProfileBootstrapWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PostProfileBootstrapWorker.name);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: Promise<void> | null = null;
  private stopped = false;

  constructor(
    private readonly config: PostConfig,
    private readonly bootstrap: PostProfileBootstrapService,
  ) {}

  onModuleInit(): void {
    if (this.config.userProjectionSyncEnabled) this.schedule(1000);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    this.bootstrap.stop();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.pending;
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      let nextDelay = 1000;
      this.pending = this.bootstrap
        .runOnce()
        .catch(() => {
          nextDelay = 30000;
          this.logger.warn({ event: 'post.profile.bootstrap', code: 'SYNC_UNAVAILABLE' });
        })
        .finally(() => {
          this.pending = null;
          this.schedule(nextDelay);
        });
    }, delayMs);
    this.timer.unref();
  }
}
