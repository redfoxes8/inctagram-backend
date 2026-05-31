import { TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { createTestApp } from '../test-app.factory';
import { prepareTestDatabase, resetTestDatabase } from '../reset-db';
import { PostsModule } from '../../src/modules/posts/posts.module';
import { PostCommandRepository } from '../../src/modules/posts/infrastructure/repositories/post.command-repository';
import { DeletePostHandler } from '../../src/modules/posts/application/commands/delete-post.handler';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { PostEntity } from '../../src/modules/posts/domain/post.entity';
import { PostImageEntity } from '../../src/modules/posts/domain/post-image.entity';

describe('Delete Post / Outbox Integration', () => {
  let module: TestingModule;

  beforeAll(async () => {
    await prepareTestDatabase();
    module = await createTestApp(
      { imports: [PostsModule] },
      {
        PORT: '3004',
        GRPC_PORT: '50051',
        RABBITMQ_URL: 'amqp://localhost',
        FILE_SERVICE_GRPC_URL: 'localhost:50051',
      },
    );
    await module.init();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterAll(async () => {
    try {
      await module.close();
    } catch {}
  });

  it('should delete a post and create an outbox event atomically', async () => {
    const repo = module.get(PostCommandRepository);
    const prisma = module.get(PrismaService);

    // Create domain entity via repository (bypass file validation)
    const ownerId = randomUUID();
    const postId = randomUUID();
    const imageId = randomUUID();

    const post = PostEntity.create({ ownerId, description: 'to be deleted' });
    // ensure we use supplied id
    post.id = postId;
    const img = PostImageEntity.create({ postId: post.id, fileId: imageId, order: 0 });
    post.setImages([img]);

    // persist
    await repo.createPost(post);

    // verify created
    const found = await repo.findById(post.id);
    expect(found).not.toBeNull();

    // delete via handler (enforces owner check)
    const handler = module.get(DeletePostHandler);
    await handler.execute({ postId: post.id, ownerId } as any);

    // verify post gone
    const after = await prisma.post.findUnique({ where: { id: post.id } });
    expect(after).toBeNull();

    // verify outbox event created
    const events = await prisma.outboxEvent.findMany({ where: { type: 'POST_DELETED' } });
    expect(events.length).toBeGreaterThanOrEqual(1);
    const payload = events[0].payload as any;
    expect(payload.postId).toEqual(post.id);
    expect(payload.ownerId).toEqual(ownerId);
    expect(Array.isArray(payload.fileIds)).toBe(true);
  });
});
