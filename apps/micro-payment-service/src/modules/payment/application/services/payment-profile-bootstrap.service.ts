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
  constructor(
    private readonly repository: IProjectionBootstrapRepository,
    private readonly exporter: IPaymentProfileExportClient,
    private readonly consumer: IProjectionConsumerState,
  ) {}
  async runOnce(): Promise<void> {
    if (!this.consumer.isConnected()) return;
    const lease = await this.repository.claim();
    if (!lease) return;
    try {
      const result = await this.exporter.exportPage(lease.request);
      if (result.outcome === 'UNAVAILABLE') {
        this.failures += 1;
        await this.repository.retry({
          lease,
          delaySeconds: Math.min(
            300,
            (result.unimplemented ? 60 : 30) * 2 ** Math.min(this.failures - 1, 4),
          ),
        });
        return;
      }
      await this.repository.complete({
        lease,
        page: result.page,
        consumerConnected: () => this.consumer.isConnected(),
      });
      this.failures = 0;
    } catch {
      await this.repository.retry({ lease, delaySeconds: 60 });
      throw new DomainException({
        code: DomainExceptionCode.ServiceUnavailable,
        message: 'Payment profile synchronization unavailable',
      });
    }
  }
}
