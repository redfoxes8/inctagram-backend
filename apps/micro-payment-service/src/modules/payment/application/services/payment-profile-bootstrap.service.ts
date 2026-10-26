import { BACKGROUND_IDLE_MS } from '../../../../../../../libs/common/src/constants/background-polling';
import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { Injectable } from '@nestjs/common';
import {
  IPaymentProfileExportClient,
  IProjectionBootstrapRepository,
  IProjectionConsumerState,
} from '../ports/payment-profile-bootstrap.port';

@Injectable()
export class PaymentProfileBootstrapService {
  private failures = 0;
  private waitingForConsumer = false;

  onConsumerConnected(wake: () => void): () => void {
    return (
      this.consumer.onConnected?.(() => {
        if (this.waitingForConsumer) wake();
      }) ?? (() => {})
    );
  }
  constructor(
    private readonly repository: IProjectionBootstrapRepository,
    private readonly exporter: IPaymentProfileExportClient,
    private readonly consumer: IProjectionConsumerState,
  ) {}
  async runOnce(): Promise<Date> {
    if (!this.consumer.isConnected()) {
      this.waitingForConsumer = true;
      return new Date(Date.now() + BACKGROUND_IDLE_MS);
    }
    this.waitingForConsumer = false;
    const lease = await this.repository.claim();
    if (!lease) return this.repository.nextCheckAt;
    try {
      const result = await this.exporter.exportPage(lease.request);
      if (result.outcome === 'UNAVAILABLE') {
        this.failures += 1;
        const delaySeconds = Math.min(
          300,
          (result.unimplemented ? 60 : 30) * 2 ** Math.min(this.failures - 1, 4),
        );
        await this.repository.retry({ lease, delaySeconds });
        return new Date(Date.now() + delaySeconds * 1000);
      }
      await this.repository.complete({
        lease,
        page: result.page,
        consumerConnected: () => this.consumer.isConnected(),
      });
      this.failures = 0;
      return new Date(Date.now() + (result.page.complete ? 24 * 60 * 60 * 1000 : 1000));
    } catch {
      await this.repository.retry({ lease, delaySeconds: 60 });
      throw new DomainException({
        code: DomainExceptionCode.ServiceUnavailable,
        message: 'Payment profile synchronization unavailable',
      });
    }
  }
}
