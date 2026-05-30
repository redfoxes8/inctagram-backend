import { TestingModule } from '@nestjs/testing';
import { createTestApp } from '../test-app.factory';
import { prepareTestDatabase, resetTestDatabase } from '../reset-db';
import { PostsModule } from '../../src/modules/posts/posts.module';
import { DeletePostHandler } from '../../src/modules/posts/application/commands/delete-post.handler';
import { DeletePostCommand } from '../../src/modules/posts/application/commands/delete-post.command';
import { UpdatePostHandler } from '../../src/modules/posts/application/commands/update-post.handler';
import { UpdatePostCommand } from '../../src/modules/posts/application/commands/update-post.command';
import { GetUserPostsHandler } from '../../src/modules/posts/application/queries/get-user-posts.handler';
import { GetUserPostsQuery } from '../../src/modules/posts/application/queries/get-user-posts.query';
import { PostCommandRepository } from '../../src/modules/posts/infrastructure/repositories/post.command-repository';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { DomainExceptionCode } from '../../../../libs/common/src';
import { makeOwnerId, makePost } from '../factories/post-test.factory';
import { of } from 'rxjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Seed N posts for ownerId with 1-second createdAt gaps so ordering is deterministic. */
async function seedPosts(
  repo: PostCommandRepository,
  ownerId: string,
  count: number,
): Promise<string[]> {
  const base = Date.now();
  const posts = Array.from({ length: count }, (_, index) => {
    const createdAt = new Date(base + index * 1000);
    return makePost({ ownerId, createdAt, updatedAt: createdAt });
  });

  // All inserts launched concurrently — this is the concurrent write we're testing
  await Promise.all(posts.map((p) => repo.createPost(p)));

  // Return IDs newest-first (matches query orderBy)
  return posts.map((p) => p.id).reverse();
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

describe('Concurrency / Ordering Integration', () => {
  let module: TestingModule;
  let deleteHandler: DeletePostHandler;
  let updateHandler: UpdatePostHandler;
  let queryHandler: GetUserPostsHandler;
  let repo: PostCommandRepository;
  let prisma: PrismaService;

  beforeAll(async () => {
    await prepareTestDatabase();

    // GetUserPostsHandler has gRPC dep — stub it with a no-op file client
    const mockGetFilesData = jest.fn().mockReturnValue(of({ files: {} }));
    const fakeFileClient = {
      getService: () => ({ getFilesData: mockGetFilesData }),
    };

    module = await createTestApp(
      {
        imports: [PostsModule],
        providers: [{ provide: 'FILE_SERVICE_PACKAGE', useValue: fakeFileClient }],
      },
      {
        PORT: '3007',
        GRPC_PORT: '50054',
        RABBITMQ_URL: 'amqp://localhost',
        FILE_SERVICE_GRPC_URL: 'localhost:50054',
      },
    );

    await module.init();

    // Post-init override for query handler gRPC proxy
    const queryHandlerInstance = module.get(GetUserPostsHandler);
    // @ts-expect-error replace private field with stub
    queryHandlerInstance.fileService = fakeFileClient.getService();

    deleteHandler = module.get(DeletePostHandler);
    updateHandler = module.get(UpdatePostHandler);
    queryHandler = queryHandlerInstance;
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
  // 1. Concurrent create ordering
  // -------------------------------------------------------------------------

  describe('concurrent create ordering', () => {
    it('persists all posts without losing writes under concurrent inserts', async () => {
      const ownerId = makeOwnerId();

      // 8 concurrent inserts
      await seedPosts(repo, ownerId, 8);

      const count = await prisma.post.count({ where: { ownerId } });
      expect(count).toBe(8);
    });

    it('query returns stable newest-first ordering after concurrent inserts', async () => {
      const ownerId = makeOwnerId();
      const expectedIds = await seedPosts(repo, ownerId, 6);

      const { posts, hasMore } = await queryHandler.execute(
        new GetUserPostsQuery(ownerId, 10),
      );

      expect(hasMore).toBe(false);
      expect(posts.map((p) => p.id)).toEqual(expectedIds);
    });

    it('produces no duplicate IDs in query result after concurrent inserts', async () => {
      const ownerId = makeOwnerId();
      await seedPosts(repo, ownerId, 5);

      const { posts } = await queryHandler.execute(new GetUserPostsQuery(ownerId, 10));

      const uniqueIds = new Set(posts.map((p) => p.id));
      expect(uniqueIds.size).toBe(posts.length);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Update vs delete race
  // -------------------------------------------------------------------------

  describe('update vs delete race', () => {
    it('DB is in a consistent state regardless of which operation wins', async () => {
      const ownerId = makeOwnerId();
      const post = makePost({ ownerId });
      await repo.createPost(post);

      // Race: update and delete launched simultaneously
      const results = await Promise.allSettled([
        updateHandler.execute(new UpdatePostCommand(post.id, ownerId, 'Raced description')),
        deleteHandler.execute(new DeletePostCommand(post.id, ownerId)),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // At least one must succeed — both may succeed if update wins then delete also wins
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);

      // Any rejection must carry a known domain code (NotFound), never an unknown error
      for (const r of rejected) {
        const reason = (r as PromiseRejectedResult).reason;
        expect(reason).toMatchObject({ code: DomainExceptionCode.NotFound });
      }

      // Outbox events: exactly 0 or 1 — never 2 (atomicity must hold)
      const events = await prisma.outboxEvent.findMany({
        where: { type: 'POST_DELETED' },
      });
      expect(events.length).toBeLessThanOrEqual(1);

      // No orphaned post_image rows without a parent post
      const orphanedImages = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count
        FROM "PostImage" pi
        LEFT JOIN "Post" p ON pi."postId" = p.id
        WHERE p.id IS NULL
      `;
      expect(Number(orphanedImages[0].count)).toBe(0);
    });

    it('delete wins: post is gone and one outbox event exists', async () => {
      const ownerId = makeOwnerId();
      const post = makePost({ ownerId });
      await repo.createPost(post);

      // Ensure delete wins by awaiting it first, then update
      await deleteHandler.execute(new DeletePostCommand(post.id, ownerId));

      await expect(
        updateHandler.execute(new UpdatePostCommand(post.id, ownerId, 'Too late')),
      ).rejects.toMatchObject({ code: DomainExceptionCode.NotFound });

      const events = await prisma.outboxEvent.findMany({
        where: { type: 'POST_DELETED' },
      });
      expect(events).toHaveLength(1);

      const gone = await repo.findById(post.id);
      expect(gone).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 3. Duplicate command safety
  // -------------------------------------------------------------------------

  describe('duplicate command safety', () => {
    it('concurrent duplicate deletes produce exactly one outbox event', async () => {
      const ownerId = makeOwnerId();
      const post = makePost({ ownerId });
      await repo.createPost(post);

      // Same command sent twice concurrently
      const results = await Promise.allSettled([
        deleteHandler.execute(new DeletePostCommand(post.id, ownerId)),
        deleteHandler.execute(new DeletePostCommand(post.id, ownerId)),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Exactly one must succeed
      expect(fulfilled).toHaveLength(1);
      // The other must fail — either:
      //   a) handler-level guard (findById → null) → DomainException.NotFound
      //   b) repo-level race (both pass findById, second loses inside $transaction) → Prisma P2025
      // Both are behaviorally correct: the post was gone by the time the second delete landed.
      expect(rejected).toHaveLength(1);
      const rejectedReason = (rejected[0] as PromiseRejectedResult).reason as any;
      const isHandlerNotFound =
        rejectedReason?.code === DomainExceptionCode.NotFound;
      const isPrismaRaceCondition = rejectedReason?.code === 'P2025';
      expect(isHandlerNotFound || isPrismaRaceCondition).toBe(true);

      // Exactly one outbox event — no duplicates
      const events = await prisma.outboxEvent.findMany({
        where: {
          type: 'POST_DELETED',
          payload: { path: ['postId'], equals: post.id },
        },
      });
      expect(events).toHaveLength(1);
    });

    it('post is fully absent from DB after both concurrent deletes settle', async () => {
      const ownerId = makeOwnerId();
      const post = makePost({ ownerId });
      await repo.createPost(post);

      await Promise.allSettled([
        deleteHandler.execute(new DeletePostCommand(post.id, ownerId)),
        deleteHandler.execute(new DeletePostCommand(post.id, ownerId)),
      ]);

      const found = await repo.findById(post.id);
      expect(found).toBeNull();
    });

    it('concurrent duplicate updates leave description in a valid state', async () => {
      const ownerId = makeOwnerId();
      const post = makePost({ ownerId });
      await repo.createPost(post);

      const descA = 'Concurrent update A';
      const descB = 'Concurrent update B';

      await Promise.allSettled([
        updateHandler.execute(new UpdatePostCommand(post.id, ownerId, descA)),
        updateHandler.execute(new UpdatePostCommand(post.id, ownerId, descB)),
      ]);

      const persisted = await repo.findById(post.id);
      expect(persisted).not.toBeNull();
      // Description must be exactly one of the two valid outcomes — never empty, never corrupted
      expect([descA, descB]).toContain(persisted!.description);
    });
  });
});
