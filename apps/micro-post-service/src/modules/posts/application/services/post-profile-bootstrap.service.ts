import { BACKGROUND_IDLE_MS } from '../../../../../../../libs/common/src/constants/background-polling';
import { Injectable } from '@nestjs/common';
import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import {
  PostProfileExport,
  PostProfileConsumerState,
  PostProjectionProgress,
  type PostProjectionLease,
} from '../ports/post-profile-bootstrap.port';

@Injectable()
export class PostProfileBootstrapService {
  private failures = 0;
  private waitingForConsumer = false;

  onConsumerConnected(wake: () => void): () => void {
    return (
      this.consumer.onConnected?.(() => {
        if (this.waitingForConsumer) wake();
      }) ?? (() => {})
    );
  }
  private stopped = false;

  constructor(
    private readonly progress: PostProjectionProgress,
    private readonly exporter: PostProfileExport,
    private readonly consumer: PostProfileConsumerState,
  ) {}

  stop(): void {
    this.stopped = true;
  }

  async runOnce(): Promise<Date> {
    if (this.stopped || !this.consumer.isConnected()) {
      this.waitingForConsumer = true;
      return new Date(Date.now() + BACKGROUND_IDLE_MS);
    }
    this.waitingForConsumer = false;
    let lease: PostProjectionLease | null = null;
    try {
      lease = await this.progress.claim();
      if (!lease) return this.progress.nextCheckAt;
      const result = await this.exporter.exportPage(lease.request);
      if (result.outcome === 'UNAVAILABLE' || this.stopped) {
        this.failures += 1;
        const minimum = result.outcome === 'UNAVAILABLE' && result.unimplemented ? 60 : 30;
        const delaySeconds = Math.min(300, minimum * 2 ** Math.min(this.failures - 1, 4));
        await this.progress.retry({
          lease,
          delaySeconds,
        });
        return new Date(Date.now() + delaySeconds * 1000);
      }
      await this.progress.complete({
        lease,
        page: result.page,
        consumerConnected: () => !this.stopped && this.consumer.isConnected(),
      });
      this.failures = 0;
      return new Date(Date.now() + (result.page.complete ? 24 * 60 * 60 * 1000 : 1000));
    } catch {
      if (lease) {
        await this.progress.retry({ lease, delaySeconds: 60 }).catch(() => undefined);
      }
      throw new DomainException({
        code: DomainExceptionCode.ServiceUnavailable,
        message: 'Post profile synchronization unavailable',
      });
    }
  }
}
