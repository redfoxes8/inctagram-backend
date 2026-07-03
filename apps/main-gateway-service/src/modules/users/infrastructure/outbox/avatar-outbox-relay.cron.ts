import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import amqp from 'amqplib';

import { GatewayConfig } from '../../../../core/gateway.config';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import {
  AVATAR_DELETED_ROUTING_KEY,
  PROFILE_EVENTS_EXCHANGE,
} from '../../domain/constants/avatar-outbox.constants';

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
export class AvatarOutboxRelayCron {
  private readonly logger = new Logger(AvatarOutboxRelayCron.name);

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
    private readonly config: GatewayConfig,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleOutboxRelay(): Promise<void> {
    const pending = await this.prisma.outboxEvent.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    if (!pending.length) {
      this.logger.debug('[AvatarOutboxRelay] no pending events, skipping status=PENDING');
      return;
    }

    this.logger.log(
      `[AvatarOutboxRelay] relay started, picked ${pending.length} event(s) pickedCount=${pending.length}`,
    );

    let conn: AmqpConnection | undefined;
    let ch: AmqpChannel | undefined;

    try {
      const connection = await amqp.connect(this.config.rabbitmqUrl);
      conn = connection;
      const channel = await connection.createChannel();
      ch = channel;
      await channel.assertExchange(PROFILE_EVENTS_EXCHANGE, 'topic', { durable: true });

      if (!ch) {
        this.logger.error('[AvatarOutboxRelay] relay error: AMQP channel is not available after creation');
        return;
      }

      for (const ev of pending) {
        this.logger.log(
          `[AvatarOutboxRelay] processing event id=${ev.id} type=${ev.type} eventId=${ev.id} eventType=${ev.type} status=${ev.status} createdAt=${ev.createdAt.toISOString()}`,
        );

        try {
          this.logger.debug(
            `[AvatarOutboxRelay] publishing to exchange=${PROFILE_EVENTS_EXCHANGE} routingKey=${AVATAR_DELETED_ROUTING_KEY} eventId=${ev.id}`,
          );

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

          const publishResult = ch.publish(
            PROFILE_EVENTS_EXCHANGE,
            AVATAR_DELETED_ROUTING_KEY,
            buf,
            { persistent: true },
          );

          if (publishResult) {
            this.logger.log(
              `[AvatarOutboxRelay] published event id=${ev.id} eventId=${ev.id} exchange=${PROFILE_EVENTS_EXCHANGE} routingKey=${AVATAR_DELETED_ROUTING_KEY} eventType=${ev.type}`,
            );

            const processedAt = new Date();
            await this.prisma.outboxEvent.update({
              where: { id: ev.id },
              data: { status: 'PROCESSED', processedAt },
            });

            this.logger.log(
              `[AvatarOutboxRelay] marked processed event id=${ev.id} eventId=${ev.id} processedAt=${processedAt.toISOString()}`,
            );
          } else {
            this.logger.warn(
              `[AvatarOutboxRelay] publish returned false for event id=${ev.id} eventId=${ev.id} exchange=${PROFILE_EVENTS_EXCHANGE} routingKey=${AVATAR_DELETED_ROUTING_KEY}`,
            );
          }
        } catch (err) {
          this.logger.error(
            `[AvatarOutboxRelay] failed to publish event id=${ev.id}: ${this.toMessage(err)} eventId=${ev.id} exchange=${PROFILE_EVENTS_EXCHANGE} routingKey=${AVATAR_DELETED_ROUTING_KEY} error=${this.toMessage(err)}`,
          );
        }
      }
    } catch (err) {
      this.logger.error(`[AvatarOutboxRelay] relay error: ${this.toMessage(err)} error=${this.toMessage(err)}`);
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
