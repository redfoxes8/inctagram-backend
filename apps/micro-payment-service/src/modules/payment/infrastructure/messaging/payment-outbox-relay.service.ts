import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { hostname } from 'os';
import { randomUUID } from 'crypto';

import { PaymentConfig } from '../../../../core/payment.config';
import {
  ClaimedPaymentOutboxEvent,
  IPaymentOutboxPublisher,
  IPaymentOutboxRelayRepository,
} from '../../application/ports/payment-outbox-relay.port';

/**
 * Delivery is at-least-once. A crash after broker confirm and before the
 * PUBLISHED update can cause redelivery; consumers must deduplicate eventId.
 */
@Injectable()
export class PaymentOutboxRelayService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PaymentOutboxRelayService.name);
  private readonly workerId = `${hostname()}:${process.pid}:${randomUUID()}`;
  private running: Promise<void> | null = null;
  private stopping = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: PaymentConfig,
    private readonly repository: IPaymentOutboxRelayRepository,
    private readonly publisher: IPaymentOutboxPublisher,
  ) {}

  public onApplicationBootstrap(): void {
    if (!this.config.outboxRelayEnabled) return;
    this.timer = setInterval(() => this.tick(), 1_000);
  }

  public tick(): void {
    if (
      !this.config.outboxRelayEnabled ||
      this.stopping ||
      this.running ||
      !this.matchesCron(new Date(), this.config.outboxRelayCron)
    ) {
      return;
    }
    this.running = this.relayBatch()
      .catch(() => this.logger.error('Payment outbox relay batch failed'))
      .finally(() => {
        this.running = null;
      });
  }

  public async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const running = this.running;
    if (running) {
      await Promise.race([
        running,
        new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 10_000);
          timeout.unref();
        }),
      ]);
    }
    await this.publisher.close();
  }

  private async relayBatch(): Promise<void> {
    const now = new Date();
    const claimed = await this.repository.claim({
      workerId: this.workerId,
      now,
      staleBefore: new Date(now.getTime() - this.config.outboxRelayLockTimeoutSeconds * 1_000),
      batchSize: this.config.outboxRelayBatchSize,
      maxAttempts: this.config.outboxRelayMaxAttempts,
    });
    await Promise.all(claimed.map((event) => this.publishOne(event)));
  }

  private async publishOne(event: ClaimedPaymentOutboxEvent): Promise<void> {
    try {
      await this.publisher.publish(event);
      const completed = await this.repository.markPublished(event.id, this.workerId, new Date());
      if (!completed) this.logger.warn('Outbox claim ownership changed before completion');
    } catch {
      const completed = await this.repository.markFailedOrRetry({
        id: event.id,
        workerId: this.workerId,
        safeError: 'OUTBOX_PUBLISH_FAILED',
        now: new Date(),
        maxAttempts: this.config.outboxRelayMaxAttempts,
        baseBackoffSeconds: this.config.outboxRelayBackoffSeconds,
      });
      if (!completed) this.logger.warn('Outbox claim ownership changed before retry scheduling');
    }
  }

  private matchesCron(now: Date, expression: string): boolean {
    const fields = expression.split(/\s+/u);
    const values = [
      now.getUTCSeconds(),
      now.getUTCMinutes(),
      now.getUTCHours(),
      now.getUTCDate(),
      now.getUTCMonth() + 1,
      now.getUTCDay(),
    ];
    return (
      fields.length === values.length &&
      fields.every((field, index) => {
        if (field === '*') return true;
        if (field.startsWith('*/')) return values[index] % Number(field.slice(2)) === 0;
        return values[index] === Number(field);
      })
    );
  }
}
