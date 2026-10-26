import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { GatewayConfig } from '../../../core/gateway.config';
import { PostPublishedDelivery } from '../application/post-published-delivery';
import {
  connectPaymentProfileBroker,
  type ProfileBrokerConnection,
  type ProfileConsumerChannel,
  type ProfileMessage,
} from '../../../../../../libs/common/src/messaging/payment-profile-confirm-publisher';
import {
  parsePostPublishedV1,
  POST_PUBLISHED_EXCHANGE,
  POST_PUBLISHED_ROUTING_KEY,
  type PostPublishedV1,
} from '../../../../../../libs/contracts/src/events/post-published-v1.event';

type FanoutChannel = Omit<ProfileConsumerChannel, 'assertQueue' | 'consume'> & {
  assertQueue(name: string, options: object): Promise<{ queue: string }>;
  consume(
    queue: string,
    handler: (message: ProfileMessage | null) => void,
    options: object,
  ): Promise<{ consumerTag: string }>;
  cancel(tag: string): Promise<unknown>;
};

@Injectable()
export class PostPublishedFanoutConsumer implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PostPublishedFanoutConsumer.name);
  private connection: ProfileBrokerConnection | null = null;
  private channel: FanoutChannel | null = null;
  private tag: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private opening: Promise<void> | null = null;
  private generation = 0;
  private failures = 0;
  private stopped = false;

  constructor(
    private readonly config: GatewayConfig,
    private readonly delivery: PostPublishedDelivery,
  ) {}
  onApplicationBootstrap(): Promise<void> {
    if (this.stopped || (this.connection && this.delivery.isBrokerReady)) return Promise.resolve();
    this.opening ??= this.connect().finally(() => {
      this.opening = null;
    });
    return this.opening;
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    const generation = ++this.generation;
    let resolveReady!: (ready: boolean) => void;
    const ready = new Promise<boolean>((resolve) => {
      resolveReady = resolve;
    });
    let connection: ProfileBrokerConnection | null = null;
    try {
      connection = await connectPaymentProfileBroker(this.config.rabbitmqUrl);
      const lost = (): void => this.lost(generation);
      connection.on('error', lost);
      connection.on('close', lost);
      if (this.stopped || generation !== this.generation) {
        await connection.close();
        return;
      }
      this.connection = connection;
      const channel = (await connection.createChannel()) as FanoutChannel;
      this.channel = channel;
      channel.on('error', lost);
      channel.on('close', lost);
      await channel.assertExchange(POST_PUBLISHED_EXCHANGE, 'topic', {
        durable: true,
        autoDelete: false,
      });
      await channel.prefetch(4);
      const queue = await channel.assertQueue('', {
        durable: false,
        exclusive: true,
        autoDelete: true,
      });
      await channel.bindQueue(queue.queue, POST_PUBLISHED_EXCHANGE, POST_PUBLISHED_ROUTING_KEY);
      const { consumerTag } = await channel.consume(
        queue.queue,
        (message) => {
          if (!message) {
            lost();
            return;
          }
          void ready.then((connected) => {
            if (connected) return this.consume({ message, channel, generation });
          });
        },
        { noAck: false },
      );
      if (this.stopped || generation !== this.generation) {
        await connection.close();
        return;
      }
      this.tag = consumerTag;
      this.failures = 0;
      this.delivery.brokerConnected();
      resolveReady(true);
    } catch {
      this.lost(generation);
      await connection?.close().catch(() => undefined);
    } finally {
      resolveReady(false);
    }
  }

  private async consume(input: {
    message: ProfileMessage;
    channel: FanoutChannel;
    generation: number;
  }): Promise<void> {
    try {
      let event: PostPublishedV1 | undefined;
      try {
        event = parsePostPublishedV1(JSON.parse(input.message.content.toString('utf8')) as unknown);
      } catch {
        this.logger.warn({ event: 'post.published.rejected', code: 'INVALID_EVENT' });
      }
      const outcome = event ? await this.delivery.handle(event) : 'ignored';
      if (outcome === 'failedRefetch')
        this.logger.warn({ event: 'post.published.refetch', code: 'READ_UNAVAILABLE' });
      if (!this.stopped && input.generation === this.generation && outcome !== 'disconnected')
        input.channel.ack(input.message);
    } catch {
      this.lost(input.generation);
    }
  }

  private lost(generation: number): void {
    if (generation !== this.generation) return;
    this.generation++;
    this.delivery.brokerDisconnected();
    const connection = this.connection;
    this.connection = null;
    this.channel = null;
    this.tag = null;
    void connection?.close().catch(() => undefined);
    if (this.stopped || this.timer) return;
    const delay = Math.min(60000, 30000 * 2 ** Math.min(this.failures++, 1));
    this.logger.warn({ event: 'post.published.fanout', code: 'BROKER_UNAVAILABLE' });
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.onApplicationBootstrap();
    }, delay);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.generation++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.delivery.brokerDisconnected();
    const connection = this.connection;
    const channel = this.channel;
    const tag = this.tag;
    this.connection = null;
    this.channel = null;
    this.tag = null;
    if (channel && tag) await channel.cancel(tag).catch(() => undefined);
    await connection?.close().catch(() => undefined);
    await this.opening;
  }
}
