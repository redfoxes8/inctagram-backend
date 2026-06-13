import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../core/prisma/prisma.service';
import amqp from 'amqplib';
import { POST_EVENTS_EXCHANGE } from '../../../../../../libs/contracts/src';
import { PostConfig } from '../../../core/post.config';

type AmqpChannel = {
  assertExchange(exchange: string, type: string, opts?: { durable?: boolean }): Promise<unknown>;
  publish(
    exchange: string,
    routingKey: string,
    content: Buffer,
    opts?: { persistent?: boolean },
  ): boolean;
  close(): Promise<void>;
};

type AmqpConnection = {
  createChannel(): Promise<AmqpChannel>;
  close(): Promise<void>;
};

@Injectable()
export class OutboxRelayCron {
  private readonly logger = new Logger(OutboxRelayCron.name);

  private toMessage(input: unknown): string {
    if (input instanceof Error) return input.message;
    if (typeof input === 'string') return input;
    try {
      return JSON.stringify(input);
    } catch {
      return String(input);
    }
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: PostConfig,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async handleOutboxRelay(): Promise<void> {
    const pending = await this.prisma.outboxEvent.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    if (!pending.length) return;

    // Debug: log picked events count
    this.logger.log(`[OUTBOX] picked ${pending.length} event(s)`);

    let conn: AmqpConnection | undefined;
    let ch: AmqpChannel | undefined;

    try {
      const connection = await amqp.connect(this.config.rabbitUrl);
      conn = connection;
      const channel = await connection.createChannel();
      ch = channel;
      await channel.assertExchange(POST_EVENTS_EXCHANGE, 'topic', { durable: true });

      if (!ch) {
        this.logger.error('AMQP channel is not available after creation');
        return;
      }

      for (const ev of pending) {
        // Short log when picking an individual event
        this.logger.log(`[OUTBOX] picked event id=${ev.id} type=${ev.type}`);
        try {
          const routingKey = 'post.deleted';

          const rawPayload: unknown = ev.payload as unknown;
          let payload: unknown;
          if (typeof rawPayload === 'string') {
            try {
              payload = JSON.parse(rawPayload);
            } catch {
              payload = rawPayload;
            }
          } else {
            payload = rawPayload;
          }

          const buf = Buffer.from(JSON.stringify(payload));

          // Publish to legacy post_events exchange (keep existing behavior)
          this.logger.log(
            `[OUTBOX] publishing event id=${ev.id} type=${ev.type} to ${POST_EVENTS_EXCHANGE} routingKey=${routingKey}`,
          );

          const publishResult = ch.publish(POST_EVENTS_EXCHANGE, routingKey, buf, {
            persistent: true,
          });

          if (publishResult) {
            this.logger.log(
              `[RABBIT] publish to ${POST_EVENTS_EXCHANGE} success id=${ev.id} routingKey=${routingKey}`,
            );
          } else {
            this.logger.warn(
              `[RABBIT] publish to ${POST_EVENTS_EXCHANGE} returned false for id=${ev.id} routingKey=${routingKey}`,
            );
          }

          // Additionally publish to common_exchange so existing consumers receive events without infra changes
          try {
            this.logger.log(
              `[OUTBOX] publishing event id=${ev.id} type=${ev.type} to common_exchange routingKey=${routingKey}`,
            );
            const publishResultCommon = ch.publish('common_exchange', routingKey, buf, {
              persistent: true,
            });
            if (publishResultCommon) {
              this.logger.log(
                `[RABBIT] publish to common_exchange success id=${ev.id} routingKey=${routingKey}`,
              );
            } else {
              this.logger.warn(
                `[RABBIT] publish to common_exchange returned false for id=${ev.id} routingKey=${routingKey}`,
              );
            }
          } catch (e) {
            this.logger.error(
              `Failed to publish to common_exchange for event ${ev.id}: ${this.toMessage(e)}`,
            );
            // Do not rethrow — maintain existing post_events publish
          }

          await this.prisma.outboxEvent.update({
            where: { id: ev.id },
            data: { status: 'PROCESSED', processedAt: new Date() },
          });

          this.logger.log(`Relayed outbox event ${ev.id} to exchange ${POST_EVENTS_EXCHANGE}`);
        } catch (err) {
          this.logger.error(`Failed to publish outbox event: ${this.toMessage(err)}`);
          // leave as PENDING for retry; consider marking FAILED after N attempts (not implemented)
        }
      }
    } catch (err) {
      this.logger.error(`Outbox relay error: ${this.toMessage(err)}`);
    } finally {
      try {
        if (ch) await ch.close();
        if (conn) await conn.close();
      } catch {
        // ignore close errors
      }
    }
  }
}
