import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { NotificationOutboxPublisher } from './notification-outbox.publisher';
import { NotificationOutboxRepository } from '../repositories/notification-outbox.repository';

const OUTBOX_RECOVERY_BATCH_SIZE = 25;

@Injectable()
export class NotificationOutboxRecoveryService {
  private readonly logger = new Logger(NotificationOutboxRecoveryService.name);
  private running = false;

  constructor(
    private readonly outbox: NotificationOutboxRepository,
    private readonly publisher: NotificationOutboxPublisher,
  ) {}

  @Cron('0 */20 * * * *')
  public async recover(): Promise<void> {
    if (process.env.NOTIFICATION_OUTBOX_RELAY_ENABLED === 'false' || this.running) return;
    this.running = true;
    try {
      const options = this.publisher.options();
      const events = await this.outbox.claimDue({
        workerId: options.workerId,
        now: new Date(),
        batchSize: OUTBOX_RECOVERY_BATCH_SIZE,
        maxAttempts: options.maxAttempts,
      });
      for (const event of events) await this.publisher.publishClaimed(event);
    } catch (error: unknown) {
      this.logger.error({
        message: 'Notification outbox recovery run failed',
        errorCode: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
      });
    } finally {
      this.running = false;
    }
  }
}
