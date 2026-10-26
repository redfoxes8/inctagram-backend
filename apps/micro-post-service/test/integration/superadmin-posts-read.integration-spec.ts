import { ConfigService } from '@nestjs/config';
import { CqrsModule, QueryBus } from '@nestjs/cqrs';
import { Test, type TestingModule } from '@nestjs/testing';
import type { ClientGrpc } from '@nestjs/microservices';
import { randomUUID } from 'node:crypto';
import { of, throwError } from 'rxjs';
import { IsolatedAdminDatabase } from '../../../main-gateway-service/test/superadmin/isolated-admin-database';
import { createIsolatedPostDatabase } from '../isolated-post-database';
import type { PrismaClient } from '../../src/core/prisma/client';
import type { PrismaService } from '../../src/core/prisma/prisma.service';
import { PostConfig } from '../../src/core/post.config';
import { FileGrpcClient } from '../../src/modules/posts/infrastructure/grpc/file-grpc.client';
import { SuperadminPostFilesAdapter } from '../../src/modules/posts/infrastructure/grpc/superadmin-post-files.adapter';
import { SuperadminPostsQueryRepository } from '../../src/modules/posts/infrastructure/repositories/superadmin-posts.query-repository';
import {
  SuperadminPostFiles,
  SuperadminPostsRead,
} from '../../src/modules/posts/application/ports/superadmin-posts-read.port';
import { SuperadminPostImagesMapper } from '../../src/modules/posts/application/mappers/superadmin-post-images.mapper';
import {
  GetSuperadminPostsPageHandler,
  GetSuperadminPostsPageQuery,
} from '../../src/modules/posts/application/queries/get-superadmin-posts-page.query';
import {
  GetSuperadminPostPublishedViewHandler,
  GetSuperadminPostPublishedViewQuery,
} from '../../src/modules/posts/application/queries/get-superadmin-post-published-view.query';
import type {
  SuperadminPostsInput,
  SuperadminPostsPage,
  SuperadminPostPublishedInput,
  SuperadminPostPublishedView,
} from '../../../../libs/common/types/superadmin-posts';
import { SuperadminPostsUnavailableException } from '../../../../libs/common/src/exceptions/superadmin-posts-unavailable.exception';
import type {
  GetFilesDataRequest,
  GetFilesDataResponse,
} from '../../../../libs/contracts/src/generated/file';

type PostFixture = { postId: string; images: { id: string; fileId: string; order: number }[] };

describe('D3 real isolated Post SQL/application reads; File transport replacement only', () => {
  jest.setTimeout(120000);
  const database = new IsolatedAdminDatabase();
  let post: PrismaClient;
  let module: TestingModule;
  let queryBus: QueryBus;
  let config: PostConfig;
  const fileRpc = jest.fn((request: GetFilesDataRequest) =>
    of<GetFilesDataResponse>({
      files: Object.fromEntries(
        request.fileIds.map((fileId) => [
          fileId,
          { fileId, fileUrl: `https://files.fixture.test/${fileId}` },
        ]),
      ),
    }),
  );

  async function profile(
    input: { username?: string; state?: 'live' | 'profileless' | 'deleted' } = {},
  ): Promise<string> {
    const userId = randomUUID();
    const state = input.state ?? 'live';
    await post.postAdminUserProfile.create({
      data: {
        userId,
        sourceVersion: 9007199254740993n,
        username: state === 'live' ? (input.username ?? 'author_name') : null,
        profileExists: state !== 'profileless',
        isDeleted: state === 'deleted',
      },
    });
    return userId;
  }
  async function fixture(input: {
    userId: string;
    postId?: string;
    date?: string;
    imageCount?: number;
    description?: string;
    deleted?: boolean;
  }): Promise<PostFixture> {
    const saved = await post.post.create({
      data: {
        id: input.postId,
        ownerId: input.userId,
        description: input.description ?? 'Real fixture description',
        createdAt: new Date(input.date ?? '2026-10-26T12:00:00.123Z'),
        deletedAt: input.deleted ? new Date() : null,
        images: {
          create: Array.from({ length: input.imageCount ?? 2 }, (_, order) => ({
            fileId: randomUUID(),
            order,
          })),
        },
      },
      include: { images: true },
    });
    return {
      postId: saved.id,
      images: saved.images.map((image) => ({
        id: image.id,
        fileId: image.fileId,
        order: image.order,
      })),
    };
  }
  function page(input: SuperadminPostsInput = {}): Promise<SuperadminPostsPage> {
    return queryBus.execute(new GetSuperadminPostsPageQuery(input));
  }
  function view(input: SuperadminPostPublishedInput): Promise<SuperadminPostPublishedView> {
    return queryBus.execute(new GetSuperadminPostPublishedViewQuery(input));
  }
  beforeAll(async () => {
    await database.start();
    post = createIsolatedPostDatabase({ database, beforeProjectionMigration: () => undefined });
    config = new PostConfig(
      new ConfigService<Record<string, string>, true>({
        PORT: '3004',
        GRPC_PORT: '50051',
        DATABASE_URL: 'postgresql://127.0.0.1:1/unused_config',
        RABBITMQ_URL: 'amqp://127.0.0.1:1',
        POST_USER_PROJECTION_SYNC_ENABLED: 'true',
        GATEWAY_USER_SERVICE_GRPC_URL: '127.0.0.1:1',
      }),
    );
    const fileClient = new FileGrpcClient({
      getService: () => ({ getFilesData: fileRpc }),
    } as unknown as ClientGrpc);
    module = await Test.createTestingModule({
      imports: [CqrsModule],
      providers: [
        GetSuperadminPostsPageHandler,
        GetSuperadminPostPublishedViewHandler,
        SuperadminPostImagesMapper,
        {
          provide: SuperadminPostsRead,
          useValue: new SuperadminPostsQueryRepository(post as PrismaService, config),
        },
        { provide: SuperadminPostFiles, useValue: new SuperadminPostFilesAdapter(fileClient) },
      ],
    }).compile();
    await module.init();
    queryBus = module.get(QueryBus);
  });
  beforeEach(async () => {
    jest.restoreAllMocks();
    fileRpc.mockClear();
    config.userProjectionSyncEnabled = true;
    await post.post.deleteMany();
    await post.postAdminUserProfile.deleteMany();
    // READY is a fixture; this suite is not bootstrap or rollout proof.
    await post.postAdminUserProjectionSync.update({
      where: { id: 'post-user-profile-v1' },
      data: { phase: 'READY', mode: 'IDLE' },
    });
  });
  afterAll(async () => {
    await module?.close();
    await post?.$disconnect();
    await database.stop();
  });

  it('fills pages by searching the whole projection before pagination, with literal case-insensitive %/_', async () => {
    const other = await profile({ username: 'unrelated' });
    for (let index = 0; index < 8; index++)
      await fixture({ userId: other, date: '2026-10-26T13:00:00.000Z' });
    const target = await profile({ username: 'Target_name' });
    const matching: string[] = [];
    for (let index = 0; index < 5; index++)
      matching.push((await fixture({ userId: target })).postId);
    const select = jest.spyOn(post, '$queryRaw');
    const first = await page({ searchUsername: '  TARGET  ' });
    expect(select).toHaveBeenCalledTimes(1);
    expect(first.items.map((item) => item.postId)).toEqual(matching.sort().reverse().slice(0, 4));
    expect(first.pageInfo.hasNextPage).toBe(true);
    expect(fileRpc).toHaveBeenCalledTimes(1);
    expect(first.items.every((item) => item.username === 'Target_name')).toBe(true);
    const next = await page({ searchUsername: 'TARGET', after: first.pageInfo.endCursor });
    expect(next.items).toHaveLength(1);
    expect(next.pageInfo.hasNextPage).toBe(false);
    for (const username of ['literal%owner', 'literal_owner', 'literalXowner']) {
      await fixture({ userId: await profile({ username }) });
    }
    expect((await page({ searchUsername: '%' })).items.map((item) => item.username)).toEqual([
      'literal%owner',
    ]);
    expect((await page({ searchUsername: 'literal_' })).items.map((item) => item.username)).toEqual(
      ['literal_owner'],
    );
  });

  it('preserves millisecond tuples and ID ties, continues after cursor-row deletion and reaches an empty end', async () => {
    const owner = await profile();
    const high = await fixture({ userId: owner, postId: '00000000-0000-4000-8000-000000000003' });
    const low = await fixture({ userId: owner, postId: '00000000-0000-4000-8000-000000000002' });
    const older = await fixture({
      userId: owner,
      postId: '00000000-0000-4000-8000-000000000004',
      date: '2026-10-26T12:00:00.122Z',
    });
    expect(
      await post.$queryRaw<
        { precision: number }[]
      >`SELECT datetime_precision AS precision FROM information_schema.columns WHERE table_name='Post' AND column_name='createdAt' AND table_schema='public'`,
    ).toEqual([{ precision: 3 }]);
    const first = await page({ first: 1 });
    expect(first.items.map((item) => item.postId)).toEqual([high.postId]);
    expect(first.items[0].publishedAt).toBe('2026-10-26T12:00:00.123Z');
    expect(
      JSON.parse(Buffer.from(first.pageInfo.endCursor!, 'base64url').toString('utf8')),
    ).toMatchObject({
      v: 1,
      createdAt: '2026-10-26T12:00:00.123Z',
      postId: high.postId,
      searchUsername: null,
    });
    await post.post.delete({ where: { id: high.postId } });
    const second = await page({ first: 1, after: first.pageInfo.endCursor });
    expect(second.items.map((item) => item.postId)).toEqual([low.postId]);
    const third = await page({ first: 1, after: second.pageInfo.endCursor });
    expect(third.items.map((item) => item.postId)).toEqual([older.postId]);
    expect(third.pageInfo.hasNextPage).toBe(false);
    expect(await page({ first: 1, after: third.pageInfo.endCursor })).toEqual({
      items: [],
      pageInfo: { endCursor: null, hasNextPage: false },
    });
  });

  it('keeps tombstone/profileless/unknown authors without search and classifies published-view outcomes', async () => {
    const liveId = await profile();
    const deletedAuthor = await fixture({ userId: await profile({ state: 'deleted' }) });
    const profileless = await fixture({ userId: await profile({ state: 'profileless' }) });
    const unknownId = randomUUID();
    const unknown = await fixture({ userId: unknownId });
    const live = await fixture({ userId: liveId });
    const deletedPost = await fixture({ userId: liveId, deleted: true });
    const result = await page();
    expect(result.items).toHaveLength(4);
    for (const postId of [deletedAuthor.postId, profileless.postId, unknown.postId]) {
      expect(result.items.find((item) => item.postId === postId)?.username).toBeNull();
    }
    expect((await page({ searchUsername: 'author' })).items.map((item) => item.postId)).toEqual([
      live.postId,
    ]);
    expect(await view({ postId: live.postId })).toMatchObject({
      outcome: 'FOUND',
      post: { username: 'author_name', userSnapshot: { sourceVersion: '9007199254740993' } },
    });
    expect(await view({ postId: deletedPost.postId })).toEqual({ outcome: 'NOT_FOUND' });
    expect(await view({ postId: randomUUID() })).toEqual({ outcome: 'NOT_FOUND' });
    expect(await view({ postId: live.postId, searchUsername: 'different' })).toEqual({
      outcome: 'FILTERED',
    });
    expect(await view({ postId: unknown.postId, searchUsername: 'different' })).toEqual({
      outcome: 'UNRESOLVED_AUTHOR',
      postId: unknown.postId,
      userId: unknownId,
    });
    expect(
      await view({ postId: unknown.postId, authorMissingConfirmed: true, authorUserId: unknownId }),
    ).toMatchObject({
      outcome: 'FOUND',
      post: { userId: unknownId, username: null, userSnapshot: null },
    });
    expect(
      await view({
        postId: unknown.postId,
        searchUsername: 'author',
        authorMissingConfirmed: true,
        authorUserId: unknownId,
      }),
    ).toEqual({ outcome: 'FILTERED' });
    await expect(
      view({ postId: unknown.postId, authorMissingConfirmed: true, authorUserId: randomUUID() }),
    ).rejects.toMatchObject({ code: 400 });
    await post.postAdminUserProfile.create({
      data: {
        userId: unknownId,
        sourceVersion: 1n,
        username: 'late_projection',
        profileExists: true,
        isDeleted: false,
      },
    });
    expect(
      await view({
        postId: unknown.postId,
        searchUsername: 'late',
        authorMissingConfirmed: true,
        authorUserId: unknownId,
      }),
    ).toMatchObject({ outcome: 'FOUND', post: { username: 'late_projection' } });
  });

  it('distinguishes NOT_READY/LOADING, disabled sync and storage failure from an empty READY/RECONCILE page', async () => {
    for (const phase of ['NOT_READY', 'LOADING'] as const) {
      await post.postAdminUserProjectionSync.update({
        where: { id: 'post-user-profile-v1' },
        data: { phase },
      });
      await expect(page()).rejects.toMatchObject({ code: 503, reason: 'NOT_READY' });
      await expect(view({ postId: randomUUID() })).rejects.toBeInstanceOf(
        SuperadminPostsUnavailableException,
      );
    }
    expect(fileRpc).not.toHaveBeenCalled();
    config.userProjectionSyncEnabled = false;
    const query = jest.spyOn(post, '$queryRaw');
    await expect(page()).rejects.toMatchObject({ code: 503, reason: 'SYNC_DISABLED' });
    expect(query).not.toHaveBeenCalled();
    config.userProjectionSyncEnabled = true;
    await post.postAdminUserProjectionSync.update({
      where: { id: 'post-user-profile-v1' },
      data: { phase: 'READY', mode: 'RECONCILE' },
    });
    expect(await page()).toEqual({ items: [], pageInfo: { endCursor: null, hasNextPage: false } });
    await post.$executeRaw`ALTER TABLE "post_admin_user_projection_sync" RENAME TO fixture_hidden_post_sync`;
    try {
      await expect(page()).rejects.toMatchObject({
        code: 503,
        reason: 'STORAGE',
        message: 'Superadmin posts unavailable',
      });
    } finally {
      await post.$executeRaw`ALTER TABLE fixture_hidden_post_sync RENAME TO "post_admin_user_projection_sync"`;
    }
  });

  it('loads at most 50 selected File IDs in one batch, preserving order/metadata, missing URLs and empty description', async () => {
    const owner = await profile();
    const posts: PostFixture[] = [];
    for (let index = 0; index < 6; index++) {
      posts.push(
        await fixture({
          userId: owner,
          imageCount: 10,
          description: '',
          date: new Date(Date.UTC(2026, 9, 26, 12, 0, 6 - index)).toISOString(),
        }),
      );
    }
    await post.postImage.updateMany({ where: { postId: posts[0].postId }, data: { order: 0 } });
    const missing = posts[0].images[0].fileId;
    fileRpc.mockImplementationOnce((request) =>
      of({
        files: Object.fromEntries(
          request.fileIds
            .filter((fileId) => fileId !== missing)
            .map((fileId) => [fileId, { fileId, fileUrl: `https://files.fixture.test/${fileId}` }]),
        ),
      }),
    );
    const result = await page({ first: 5 });
    expect(result.items.map((item) => item.postId)).toEqual(
      posts.slice(0, 5).map((item) => item.postId),
    );
    expect(result.items.every((item) => item.description === '')).toBe(true);
    expect(fileRpc).toHaveBeenCalledTimes(1);
    const requested = fileRpc.mock.calls[0][0].fileIds;
    expect(requested).toHaveLength(50);
    expect(posts[5].images.every((image) => !requested.includes(image.fileId))).toBe(true);
    expect(result.items[0].images.map((image) => image.fileId)).toEqual(
      [...posts[0].images]
        .sort((left, right) => (left.id < right.id ? -1 : 1))
        .map((image) => image.fileId),
    );
    expect(result.items[0].images.find((image) => image.fileId === missing)).toEqual({
      fileId: missing,
      order: 0,
      url: null,
    });
    expect(
      result.items[0].images.some((image) => image.url?.startsWith('https://files.fixture.test/')),
    ).toBe(true);
    fileRpc.mockImplementationOnce(() =>
      throwError(() => ({ code: 14, details: 'unsafe internal upstream endpoint' })),
    );
    await expect(page()).rejects.toMatchObject({
      code: 503,
      reason: 'FILES',
      message: 'Superadmin posts unavailable',
    });
  });

  it('rejects invalid first/search/cursor/filter and missing-confirmation input before SQL/File calls', async () => {
    const base = {
      v: 1,
      createdAt: '2026-10-26T12:00:00.123Z',
      postId: randomUUID(),
      searchUsername: null,
    };
    const cursor = (value: unknown): string =>
      Buffer.from(JSON.stringify(value)).toString('base64url');
    const query = jest.spyOn(post, '$queryRaw');
    for (const input of [
      { first: 0 },
      { first: 6 },
      { searchUsername: 'x'.repeat(101) },
      { after: '!' },
      { after: 'a'.repeat(1025) },
      { after: cursor({ ...base, v: 2 }) },
      { after: cursor({ ...base, extra: true }) },
      { after: cursor({ ...base, createdAt: '2026-02-30T00:00:00.000Z' }) },
      { after: cursor({ ...base, postId: 'invalid' }) },
      { after: cursor(base), searchUsername: 'changed' },
    ])
      await expect(page(input)).rejects.toMatchObject({ code: 400 });
    await expect(view({ postId: 'invalid' })).rejects.toMatchObject({ code: 400 });
    await expect(
      view({ postId: randomUUID(), authorMissingConfirmed: true }),
    ).rejects.toMatchObject({ code: 400 });
    expect(query).not.toHaveBeenCalled();
    expect(fileRpc).not.toHaveBeenCalled();
  });
});
