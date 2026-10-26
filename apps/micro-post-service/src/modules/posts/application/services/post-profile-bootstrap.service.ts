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
  private stopped = false;

  constructor(
    private readonly progress: PostProjectionProgress,
    private readonly exporter: PostProfileExport,
    private readonly consumer: PostProfileConsumerState,
  ) {}

  stop(): void {
    this.stopped = true;
  }

  async runOnce(): Promise<void> {
    if (this.stopped || !this.consumer.isConnected()) return;
    let lease: PostProjectionLease | null = null;
    try {
      lease = await this.progress.claim();
      if (!lease) return;
      const result = await this.exporter.exportPage(lease.request);
      if (result.outcome === 'UNAVAILABLE' || this.stopped) {
        this.failures += 1;
        const minimum = result.outcome === 'UNAVAILABLE' && result.unimplemented ? 60 : 30;
        await this.progress.retry({
          lease,
          delaySeconds: Math.min(300, minimum * 2 ** Math.min(this.failures - 1, 4)),
        });
        return;
      }
      await this.progress.complete({
        lease,
        page: result.page,
        consumerConnected: () => !this.stopped && this.consumer.isConnected(),
      });
      this.failures = 0;
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
