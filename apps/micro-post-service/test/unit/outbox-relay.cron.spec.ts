import amqp from 'amqplib';
import { OutboxRelayCron } from '../../src/modules/posts/infrastructure/outbox-relay.cron';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { PostConfig } from '../../src/core/post.config';
import { POST_EVENTS_EXCHANGE } from '../../../../libs/contracts/src';

// Mock amqplib module
jest.mock('amqplib');

describe('OutboxRelayCron (Unit)', () => {
  let cron: OutboxRelayCron;
  let prismaMock: any;
  let configMock: any;
  let amqpConnectMock: jest.Mock;
  let channelMock: any;
  let connectionMock: any;

  beforeEach(async () => {
    // Arrange: Reset mocks and prepare test stubs
    prismaMock = {
      outboxEvent: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };

    configMock = {
      rabbitUrl: 'amqp://mock-rabbit-host:5672',
    };

    channelMock = {
      assertExchange: jest.fn().mockResolvedValue(undefined),
      publish: jest.fn().mockReturnValue(true),
      close: jest.fn().mockResolvedValue(undefined),
    };

    connectionMock = {
      createChannel: jest.fn().mockResolvedValue(channelMock),
      close: jest.fn().mockResolvedValue(undefined),
    };

    amqpConnectMock = amqp.connect as jest.Mock;
    amqpConnectMock.mockResolvedValue(connectionMock);

    cron = new OutboxRelayCron(prismaMock, configMock);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should process pending outbox events successfully and publish to amqp', async () => {
    // Arrange
    const event1 = {
      id: 'event-1',
      status: 'PENDING',
      type: 'POST_DELETED',
      payload: JSON.stringify({ postId: 'post-1', ownerId: 'owner-1', fileIds: ['file-1'] }),
      createdAt: new Date(),
    };
    const event2 = {
      id: 'event-2',
      status: 'PENDING',
      type: 'POST_DELETED',
      payload: { postId: 'post-2', ownerId: 'owner-2', fileIds: [] }, // parsed format
      createdAt: new Date(),
    };

    prismaMock.outboxEvent.findMany.mockResolvedValue([event1, event2]);
    prismaMock.outboxEvent.update.mockResolvedValue({ id: 'updated' });

    // Act
    await cron.handleOutboxRelay();

    // Assert
    expect(prismaMock.outboxEvent.findMany).toHaveBeenCalledWith({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    expect(amqpConnectMock).toHaveBeenCalledWith('amqp://mock-rabbit-host:5672');
    expect(connectionMock.createChannel).toHaveBeenCalled();
    expect(channelMock.assertExchange).toHaveBeenCalledWith(POST_EVENTS_EXCHANGE, 'topic', { durable: true });

    // Verify first event published with stringified payload
    expect(channelMock.publish).toHaveBeenCalledWith(
      POST_EVENTS_EXCHANGE,
      'post.deleted',
      Buffer.from(JSON.stringify(JSON.parse(event1.payload))),
      { persistent: true },
    );

    // Verify second event published with original payload
    expect(channelMock.publish).toHaveBeenCalledWith(
      POST_EVENTS_EXCHANGE,
      'post.deleted',
      Buffer.from(JSON.stringify(event2.payload)),
      { persistent: true },
    );

    // Verify status update in DB for both events
    expect(prismaMock.outboxEvent.update).toHaveBeenCalledTimes(2);
    expect(prismaMock.outboxEvent.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'event-1' },
      data: expect.objectContaining({ status: 'PROCESSED' }),
    });

    // Verify channel and connection cleanup
    expect(channelMock.close).toHaveBeenCalled();
    expect(connectionMock.close).toHaveBeenCalled();
  });

  it('should skip publishing if there are no pending events', async () => {
    // Arrange
    prismaMock.outboxEvent.findMany.mockResolvedValue([]);

    // Act
    await cron.handleOutboxRelay();

    // Assert
    expect(amqpConnectMock).not.toHaveBeenCalled();
    expect(prismaMock.outboxEvent.update).not.toHaveBeenCalled();
  });

  it('should handle broker connection failures gracefully', async () => {
    // Arrange
    const event = {
      id: 'event-1',
      status: 'PENDING',
      payload: { postId: 'post-1' },
      createdAt: new Date(),
    };
    prismaMock.outboxEvent.findMany.mockResolvedValue([event]);
    amqpConnectMock.mockRejectedValue(new Error('Broker unavailable'));

    // Act
    await cron.handleOutboxRelay();

    // Assert
    expect(prismaMock.outboxEvent.update).not.toHaveBeenCalled();
    expect(channelMock.close).not.toHaveBeenCalled();
    expect(connectionMock.close).not.toHaveBeenCalled();
  });
});
