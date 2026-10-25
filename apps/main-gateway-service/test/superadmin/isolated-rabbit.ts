import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createConnection } from 'node:net';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { COMMON_RABBITMQ_EXCHANGE } from '../../src/core/gateway-rabbitmq.constants';

export class IsolatedRabbit {
  get url(): string {
    return this.uri;
  }
  readonly container = `sa-revoke-rabbit-${randomUUID()}`;
  private running = false;
  private uri = '';
  private readonly clients: AmqpConnection[] = [];

  async start(): Promise<void> {
    execFileSync(
      'docker',
      [
        'run',
        '-d',
        '--rm',
        '--name',
        this.container,
        '--env',
        'RABBITMQ_SERVER_ADDITIONAL_ERL_ARGS=+S 2:2 +SDcpu 1 +SDio 1',
        '-p',
        '127.0.0.1::5672',
        'rabbitmq:3.13-management-alpine',
      ],
      { stdio: 'pipe' },
    );
    this.running = true;
    const port = execFileSync('docker', ['port', this.container, '5672/tcp'], { encoding: 'utf8' })
      .trim()
      .split(':')
      .at(-1);
    this.uri = `amqp://guest:guest@127.0.0.1:${port}`;
    for (let attempt = 0; attempt < 60; attempt++) {
      const ready = await new Promise<boolean>((resolve) => {
        const socket = createConnection({ host: '127.0.0.1', port: Number(port) });
        socket.setTimeout(300);
        const done = (success: boolean): void => {
          socket.destroy();
          resolve(success);
        };
        socket.once('connect', () => done(true));
        socket.once('error', () => done(false));
        socket.once('timeout', () => done(false));
      });
      if (ready) return;
      if (attempt === 59) throw new Error('Isolated RabbitMQ unavailable');
      await new Promise<void>((resolve) => setTimeout(resolve, 300));
    }
  }

  async connection(): Promise<AmqpConnection> {
    const connection = new AmqpConnection({
      uri: this.uri,
      exchanges: [{ name: COMMON_RABBITMQ_EXCHANGE, type: 'topic' }],
      connectionInitOptions: { wait: true, timeout: 20000 },
      logger: {
        log: (): void => {},
        error: (): void => {},
        warn: (): void => {},
        debug: (): void => {},
      },
    });
    this.clients.push(connection);
    await connection.init();
    return connection;
  }

  queues(): { name: string; consumers: number }[] {
    return JSON.parse(
      execFileSync(
        'docker',
        [
          'exec',
          '-e',
          'ERL_FLAGS=+S 1:1 +SDcpu 1 +SDio 1',
          this.container,
          'rabbitmqctl',
          'list_queues',
          'name',
          'consumers',
          '--quiet',
          '--formatter',
          'json',
        ],
        { encoding: 'utf8' },
      ),
    ) as { name: string; consumers: number }[];
  }

  deliveryCounts(): { name: string; messages_ready: number; messages_unacknowledged: number }[] {
    return JSON.parse(
      execFileSync(
        'docker',
        [
          'exec',
          '-e',
          'ERL_FLAGS=+S 1:1 +SDcpu 1 +SDio 1',
          this.container,
          'rabbitmqctl',
          'list_queues',
          'name',
          'messages_ready',
          'messages_unacknowledged',
          '--quiet',
          '--formatter',
          'json',
        ],
        { encoding: 'utf8' },
      ),
    ) as { name: string; messages_ready: number; messages_unacknowledged: number }[];
  }

  pause(): void {
    execFileSync('docker', ['pause', this.container], { stdio: 'pipe' });
  }
  resume(): void {
    execFileSync('docker', ['unpause', this.container], { stdio: 'pipe' });
  }

  async stop(): Promise<void> {
    await Promise.all(this.clients.map((client) => client.close()));
    if (
      this.running &&
      execFileSync(
        'docker',
        ['ps', '-a', '--filter', `name=^/${this.container}$`, '--format', '{{.ID}}'],
        { encoding: 'utf8' },
      ).trim()
    )
      execFileSync('docker', ['stop', this.container], { stdio: 'pipe' });
    this.running = false;
  }
}
