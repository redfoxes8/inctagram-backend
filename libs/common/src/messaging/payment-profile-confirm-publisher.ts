import amqp from 'amqplib';
import { PAYMENT_PROFILE_EXCHANGE } from '../../../contracts/src/events/payment-user-profile-delivery';

export type ProfileMessage = {
  content: Buffer;
  properties: { messageId?: string; headers?: Record<string, unknown> };
};
type ProfileChannelEvents = {
  on(event: string, callback: (...args: unknown[]) => void): void;
  off(event: string, callback: (...args: unknown[]) => void): void;
  close(): Promise<void>;
};
export type ProfileConsumerChannel = ProfileChannelEvents & {
  assertExchange(exchange: string, type: string, options: object): Promise<unknown>;
  assertQueue(queue: string, options: object): Promise<unknown>;
  bindQueue(queue: string, exchange: string, key: string): Promise<unknown>;
  prefetch(count: number): Promise<unknown>;
  consume(
    queue: string,
    handler: (message: ProfileMessage | null) => void,
    options: object,
  ): Promise<unknown>;
  ack(message: ProfileMessage): void;
};
type ProfileConfirmChannel = ProfileChannelEvents & {
  assertExchange(exchange: string, type: string, options: object): Promise<unknown>;
  publish(
    exchange: string,
    key: string,
    body: Buffer,
    options: object,
    callback: (error: Error | null) => void,
  ): boolean;
};
export type ProfileBrokerConnection = ProfileChannelEvents & {
  createConfirmChannel(): Promise<ProfileConfirmChannel>;
  createChannel(): Promise<ProfileConsumerChannel>;
};

export async function connectPaymentProfileBroker(url: string): Promise<ProfileBrokerConnection> {
  const address = new URL(url);
  address.searchParams.set('heartbeat', '5');
  const client = amqp as {
    connect(url: string, options: object): Promise<ProfileBrokerConnection>;
  };
  return client.connect(address.toString(), { timeout: 5000 });
}

/** Scoped profile transport, following PaymentOutboxPublisher return/confirm correlation. */
export class PaymentProfileConfirmPublisher {
  private connection: ProfileBrokerConnection | null = null;
  private channel: ProfileConfirmChannel | null = null;
  private opening: Promise<ProfileConfirmChannel> | null = null;
  private generation = 0;
  private readonly closing = new Set<Promise<void>>();

  constructor(private readonly url: string) {}

  async publish(input: {
    routingKey: string;
    content: Buffer;
    messageId: string;
    headers?: Record<string, unknown>;
  }): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        void this.close();
        reject(new Error('PROFILE_PUBLISH_TIMEOUT'));
      }, 5000);
    });
    try {
      await Promise.race([this.send(input), timeout]);
    } catch {
      void this.close();
      throw new Error('PROFILE_PUBLISH_FAILED');
    } finally {
      clearTimeout(timer);
    }
  }

  async close(): Promise<void> {
    this.generation++;
    const connection = this.connection;
    this.connection = null;
    this.channel = null;
    this.opening = null;
    if (connection) {
      const closed = connection.close().catch(() => undefined);
      this.closing.add(closed);
      void closed.finally(() => this.closing.delete(closed));
    }
    await Promise.all(this.closing);
  }

  private async getChannel(): Promise<ProfileConfirmChannel> {
    if (this.channel) return this.channel;
    if (!this.opening) {
      const generation = this.generation;
      this.opening = this.open(generation).finally(() => {
        if (generation === this.generation) this.opening = null;
      });
    }
    return this.opening;
  }

  private async open(generation: number): Promise<ProfileConfirmChannel> {
    const connection = await connectPaymentProfileBroker(this.url);
    const invalidate = (): void => {
      if (generation === this.generation) void this.close();
    };
    connection.on('error', invalidate);
    connection.on('close', invalidate);
    if (generation !== this.generation) {
      await connection.close().catch(() => undefined);
      throw new Error('PROFILE_PUBLISH_CANCELLED');
    }
    this.connection = connection;
    try {
      const channel = await connection.createConfirmChannel();
      channel.on('error', invalidate);
      channel.on('close', invalidate);
      await channel.assertExchange(PAYMENT_PROFILE_EXCHANGE, 'topic', {
        durable: true,
        autoDelete: false,
      });
      if (generation !== this.generation) throw new Error('PROFILE_PUBLISH_CANCELLED');
      this.channel = channel;
      return channel;
    } catch {
      await connection.close().catch(() => undefined);
      throw new Error('PROFILE_CHANNEL_UNAVAILABLE');
    }
  }

  private async send(input: {
    routingKey: string;
    content: Buffer;
    messageId: string;
    headers?: Record<string, unknown>;
  }): Promise<void> {
    const channel = await this.getChannel();
    await new Promise<void>((resolve, reject) => {
      let returned = false;
      let settled = false;
      const onReturn = (value: unknown): void => {
        const message = value as ProfileMessage;
        if (message.properties.messageId === input.messageId) returned = true;
      };
      const failed = (): void => finish(new Error('PROFILE_CHANNEL_CLOSED'));
      const finish = (error: Error | null): void => {
        if (settled) return;
        settled = true;
        channel.off('return', onReturn);
        channel.off('error', failed);
        channel.off('close', failed);
        if (error || returned) reject(new Error('PROFILE_PUBLISH_UNCONFIRMED'));
        else resolve();
      };
      channel.on('return', onReturn);
      channel.on('error', failed);
      channel.on('close', failed);
      try {
        channel.publish(
          PAYMENT_PROFILE_EXCHANGE,
          input.routingKey,
          input.content,
          {
            persistent: true,
            mandatory: true,
            messageId: input.messageId,
            contentType: 'application/json',
            headers: input.headers,
          },
          (error) => {
            setImmediate(() => finish(error));
          },
        );
      } catch {
        finish(new Error('PROFILE_PUBLISH_FAILED'));
      }
    });
  }
}
