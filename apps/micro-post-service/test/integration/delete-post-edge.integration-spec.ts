import { TestingModule } from '@nestjs/testing';
import { createTestApp } from '../test-app.factory';
import { prepareTestDatabase, resetTestDatabase } from '../reset-db';
import { PostsModule } from '../../src/modules/posts/posts.module';
import { DeletePostHandler } from '../../src/modules/posts/application/commands/delete-post.handler';
import { DeletePostCommand } from '../../src/modules/posts/application/commands/delete-post.command';
import { PostCommandRepository } from '../../src/modules/posts/infrastructure/repositories/post.command-repository';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { DomainExceptionCode } from '../../../../libs/common/src';
import { makeOwnerId, makePost } from '../factories/post-test.factory';

describe('Delete Post Edge Cases Integration', () => {
  let module: TestingModule;
  let handler: DeletePostHandler;
  let repo: PostCommandRepository;
  let prisma: PrismaService;

  beforeAll(async () => {
    await prepareTestDatabase();
    module = await createTestApp(
      { imports: [PostsModule] },
      {
        PORT: '3006',
        GRPC_PORT: '50053',
        RABBITMQ_URL: 'amqp://localhost',
        FILE_SERVICE_GRPC_URL: 'localhost:50053',
      },
    );
    await module.init();
    handler = module.get(DeletePostHandler);
    repo = module.get(PostCommandRepository);
    prisma = module.get(PrismaService);
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterAll(async () => {
    try {
      await module.close();
    } catch {}
  });

  // -------------------------------------------------------------------------
  // 1. Owner mismatch
  // -------------------------------------------------------------------------

  describe('owner mismatch', () => {
    it('throws Forbidden', async () => {
      const ownerId = makeOwnerId();
      const otherOwnerId = makeOwnerId();
      const post = makePost({ ownerId });
      await repo.createPost(post);

      const command = new DeletePostCommand(post.id, otherOwnerId);

      await expect(handler.execute(command)).rejects.toMatchObject({
        code: DomainExceptionCode.Forbidden,
      });
    });

    it('post remains in DB after Forbidden', async () => {
      const ownerId = makeOwnerId();
      const otherOwnerId = makeOwnerId();
      const post = makePost({ ownerId });
      await repo.createPost(post);

      try {
        await handler.execute(new DeletePostCommand(post.id, otherOwnerId));
      } catch {}

      const found = await repo.findById(post.id);
      expect(found).not.toBeNull();
      expect(found!.ownerId).toBe(ownerId);
    });

    it('no OutboxEvent is created after Forbidden', async () => {
      const ownerId = makeOwnerId();
      const otherOwnerId = makeOwnerId();
      const post = makePost({ ownerId });
      await repo.createPost(post);

      try {
        await handler.execute(new DeletePostCommand(post.id, otherOwnerId));
      } catch {}

      const events = await prisma.outboxEvent.findMany({
        where: { type: 'POST_DELETED' },
      });
      expect(events).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Repeated delete
  // -------------------------------------------------------------------------

  describe('repeated delete', () => {
    it('first delete succeeds without error', async () => {
      const ownerId = makeOwnerId();
      const post = makePost({ ownerId });
      await repo.createPost(post);

      await expect(
        handler.execute(new DeletePostCommand(post.id, ownerId)),
      ).resolves.not.toThrow();
    });

    it('second delete on the same post throws NotFound', async () => {
      const ownerId = makeOwnerId();
      const post = makePost({ ownerId });
      await repo.createPost(post);

      await handler.execute(new DeletePostCommand(post.id, ownerId));

      await expect(
        handler.execute(new DeletePostCommand(post.id, ownerId)),
      ).rejects.toMatchObject({ code: DomainExceptionCode.NotFound });
    });

    it('no duplicate OutboxEvent records after repeated delete attempt', async () => {
      const ownerId = makeOwnerId();
      const post = makePost({ ownerId });
      await repo.createPost(post);

      await handler.execute(new DeletePostCommand(post.id, ownerId));

      try {
        await handler.execute(new DeletePostCommand(post.id, ownerId));
      } catch {}

      const events = await prisma.outboxEvent.findMany({
        where: { type: 'POST_DELETED', payload: { path: ['postId'], equals: post.id } },
      });
      expect(events).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Transactional outbox consistency
  // -------------------------------------------------------------------------

  describe('transactional outbox consistency', () => {
    it('creates exactly one POST_DELETED outbox event per delete', async () => {
      const ownerId = makeOwnerId();
      const post = makePost({ ownerId });
      await repo.createPost(post);

      await handler.execute(new DeletePostCommand(post.id, ownerId));

      const events = await prisma.outboxEvent.findMany({
        where: { type: 'POST_DELETED' },
      });
      expect(events).toHaveLength(1);
    });

    it('outbox event payload references correct postId and ownerId', async () => {
      const ownerId = makeOwnerId();
      const post = makePost({ ownerId });
      await repo.createPost(post);

      await handler.execute(new DeletePostCommand(post.id, ownerId));

      const [event] = await prisma.outboxEvent.findMany({
        where: { type: 'POST_DELETED' },
      });
      const payload = event.payload as Record<string, unknown>;
      expect(payload['postId']).toBe(post.id);
      expect(payload['ownerId']).toBe(ownerId);
      expect(Array.isArray(payload['fileIds'])).toBe(true);
    });

    it('post is removed from DB atomically with outbox event creation', async () => {
      const ownerId = makeOwnerId();
      const post = makePost({ ownerId });
      await repo.createPost(post);

      await handler.execute(new DeletePostCommand(post.id, ownerId));

      // Both effects observable in the same DB state
      const deletedPost = await prisma.post.findUnique({ where: { id: post.id } });
      const events = await prisma.outboxEvent.findMany({
        where: { type: 'POST_DELETED' },
      });

      expect(deletedPost).toBeNull();
      expect(events).toHaveLength(1);

      const postImages = await prisma.postImage.findMany({
        where: { postId: post.id },
      });
      expect(postImages).toHaveLength(0);
    });

    it('outbox event payload includes all file IDs that belonged to the post', async () => {
      const ownerId = makeOwnerId();
      const fileId1 = makeOwnerId(); // reuse UUID helper for a file id
      const fileId2 = makeOwnerId();
      const post = makePost({
        ownerId,
        images: [
          { id: makeOwnerId(), postId: '', fileId: fileId1, order: 0 } as any,
          { id: makeOwnerId(), postId: '', fileId: fileId2, order: 1 } as any,
        ],
      });
      await repo.createPost(post);

      await handler.execute(new DeletePostCommand(post.id, ownerId));

      const [event] = await prisma.outboxEvent.findMany({
        where: { type: 'POST_DELETED' },
      });
      const payload = event.payload as Record<string, unknown>;
      const fileIds = payload['fileIds'] as string[];
      expect(fileIds).toHaveLength(2);
      expect(fileIds).toContain(fileId1);
      expect(fileIds).toContain(fileId2);
    });
  });
});
