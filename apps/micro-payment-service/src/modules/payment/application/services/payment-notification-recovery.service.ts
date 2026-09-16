import { Injectable, Logger } from '@nestjs/common';

import { PaymentConfig } from '../../../../core/payment.config';
import { IPaymentNotificationRecoveryRepository } from '../../domain/interfaces/payment-notification-schedule.repository.interface';
import { ProcessDuePaymentNotificationScheduleService } from './process-due-payment-notification-schedule.service';

export type PaymentNotificationRecoveryResult = Readonly<{
  claimed: number;
  processed: number;
  skipped: number;
  failed: number;
}>;

@Injectable()
export class PaymentNotificationRecoveryService {
  private readonly logger = new Logger(PaymentNotificationRecoveryService.name);
  private running = false;

  constructor(
    private readonly config: PaymentConfig,
    private readonly repository: IPaymentNotificationRecoveryRepository,
    private readonly processor: ProcessDuePaymentNotificationScheduleService,
  ) {}

  public async runOnce(now = new Date()): Promise<PaymentNotificationRecoveryResult> {
    if (this.running) return { claimed: 0, processed: 0, skipped: 0, failed: 0 };
    this.running = true;
    try {
      const ids = await this.repository.findDueIds({
        now,
        limit: this.config.paymentNotificationRecoveryBatchSize,
      });
      let processed = 0;
      let skipped = 0;
      let failed = 0;
      for (const scheduleId of ids) {
        try {
          const result = await this.processor.process(scheduleId);
          if (result === 'COMPLETED') processed += 1;
          else skipped += 1;
        } catch (error: unknown) {
          failed += 1;
          this.logger.warn({
            scheduleId,
            errorKind: error instanceof Error ? error.name : 'UNKNOWN',
          });
        }
      }
      return { claimed: ids.length, processed, skipped, failed };
    } finally {
      this.running = false;
    }
  }
}
