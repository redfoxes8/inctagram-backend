import { TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import { createTestApp } from '../test-app.factory';
import { prepareTestDatabase, resetTestDatabase } from '../reset-db';
import { PostsModule } from '../../src/modules/posts/posts.module';
import { GetUserPostsHandler } from '../../src/modules/posts/application/queries/get-user-posts.handler';
import { GetUserPostsQuery } from '../../src/modules/posts/application/queries/get-user-posts.query';
import { PostCommandRepository } from '../../src/modules/posts/infrastructure/repositories/post.command-repository';
import { makeOwnerId, makePost } from '../factories/post-test.factory';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Seed N posts for a single owner with strictly ascending createdAt
 *  so the ordering (desc) is deterministic.  Returns posts newest-first. */
async function seedPosts(
  repo: PostCommandRepository,
  ownerId: string,
  count: number,
): Promise<string[]> {
  const ids: string[] = [];
  const base = Date.now();

  for (let index = 0; index < count; index++) {
    const createdAt = new Date(base + index * 1000); // 1-second gap each
    const post = makePost({ ownerId, createdAt, updatedAt: createdAt });
    await repo.createPost(post);
    ids.push(post.id);
  }

  // Return newest-first (matches handler's orderBy)
  return ids.reverse();
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

describe('Pagination Integration', () => {
  let module: TestingModule;
  let handler: GetUserPostsHandler;
  let repo: PostCommandRepository;
  let mockGetFilesData: jest.Mock;

  beforeAll(async () => {
    await prepareTestDatabase();

    mockGetFilesData = jest.fn().mockReturnValue(of({ files: {} }));
    const fakeFileClient = {
      getService: () => ({ getFilesData: mockGetFilesData }),
    };

    module = await createTestApp(
      {
        imports: [PostsModule],
        providers: [{ provide: 'FILE_SERVICE_PACKAGE', useValue: fakeFileClient }],
      },
      {
        PORT: '3005',
        GRPC_PORT: '50052',
        RABBITMQ_URL: 'amqp://localhost',
        FILE_SERVICE_GRPC_URL: 'localhost:50052',
      },
    );

    await module.init();

    // Post-init override: replace gRPC proxy with fake (same pattern as create-post tests)
    const handlerInstance = module.get(GetUserPostsHandler);
    // @ts-expect-error – replace private field with stub
    handlerInstance.fileService = fakeFileClient.getService();

    handler = handlerInstance;
    repo = module.get(PostCommandRepository);
  });

  beforeEach(async () => {
    await resetTestDatabase();
    mockGetFilesData.mockReset();
    mockGetFilesData.mockReturnValue(of({ files: {} }));
  });

  afterAll(async () => {
    await module.close();
  });

  // -------------------------------------------------------------------------
  // 1. Stable ordering
  // -------------------------------------------------------------------------

  it('returns posts in stable newest-first order', async () => {
    const ownerId = makeOwnerId();
    const expectedIds = await seedPosts(repo, ownerId, 4);

    const { posts } = await handler.execute(new GetUserPostsQuery(ownerId, 10));

    const returnedIds = posts.map((p) => p.id);
    expect(returnedIds).toEqual(expectedIds);
  });

  // -------------------------------------------------------------------------
  // 2. Cursor correctness: nextCursor is set iff more items exist
  // -------------------------------------------------------------------------

  it('sets hasMore and nextCursor when result is truncated', async () => {
    const ownerId = makeOwnerId();
    await seedPosts(repo, ownerId, 5);

    const page1 = await handler.execute(new GetUserPostsQuery(ownerId, 3));

    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).toBeTruthy();
    expect(page1.posts).toHaveLength(3);
  });

  it('sets hasMore=false and nextCursor=null on the last page', async () => {
    const ownerId = makeOwnerId();
    await seedPosts(repo, ownerId, 3);

    const { posts, hasMore, nextCursor } = await handler.execute(
      new GetUserPostsQuery(ownerId, 10),
    );

    expect(hasMore).toBe(false);
    expect(nextCursor).toBeNull();
    expect(posts).toHaveLength(3);
  });

  // -------------------------------------------------------------------------
  // 3. No duplicates across pages
  // -------------------------------------------------------------------------

  it('produces no duplicates when paginating through all items', async () => {
    const ownerId = makeOwnerId();
    const total = 7;
    await seedPosts(repo, ownerId, total);

    const pageSize = 3;
    const collectedIds: string[] = [];
    let cursor: string | undefined = undefined;

    // Walk all pages until exhausted
    for (let page = 0; page < 10; page++) {
      const result = await handler.execute(new GetUserPostsQuery(ownerId, pageSize, cursor));
      collectedIds.push(...result.posts.map((p) => p.id));

      if (!result.hasMore) break;
      cursor = result.nextCursor ?? undefined;
    }

    // All items retrieved
    expect(collectedIds).toHaveLength(total);

    // No duplicates
    const unique = new Set(collectedIds);
    expect(unique.size).toBe(total);
  });

  // -------------------------------------------------------------------------
  // 4. Ordering consistency across pages
  // -------------------------------------------------------------------------

  it('maintains global newest-first order across page boundaries', async () => {
    const ownerId = makeOwnerId();
    const total = 6;
    const expectedIds = await seedPosts(repo, ownerId, total);

    const pageSize = 2;
    const collectedIds: string[] = [];
    let cursor: string | undefined = undefined;

    for (let page = 0; page < 10; page++) {
      const result = await handler.execute(new GetUserPostsQuery(ownerId, pageSize, cursor));
      collectedIds.push(...result.posts.map((p) => p.id));
      if (!result.hasMore) break;
      cursor = result.nextCursor ?? undefined;
    }

    expect(collectedIds).toEqual(expectedIds);
  });

  // -------------------------------------------------------------------------
  // 5. User isolation: other owners' posts never appear
  // -------------------------------------------------------------------------

  it('does not leak posts belonging to a different owner', async () => {
    const ownerId = makeOwnerId();
    const otherOwnerId = makeOwnerId();

    await seedPosts(repo, ownerId, 3);
    await seedPosts(repo, otherOwnerId, 3);

    const { posts } = await handler.execute(new GetUserPostsQuery(ownerId, 10));

    const leaked = posts.filter((p) => p.ownerId !== ownerId);
    expect(leaked).toHaveLength(0);
    expect(posts).toHaveLength(3);
  });

  // -------------------------------------------------------------------------
  // 6. Empty result set
  // -------------------------------------------------------------------------

  it('returns empty result with no cursor for a user with no posts', async () => {
    const ownerId = makeOwnerId();

    const { posts, hasMore, nextCursor } = await handler.execute(
      new GetUserPostsQuery(ownerId, 5),
    );

    expect(posts).toHaveLength(0);
    expect(hasMore).toBe(false);
    expect(nextCursor).toBeNull();
  });
});
