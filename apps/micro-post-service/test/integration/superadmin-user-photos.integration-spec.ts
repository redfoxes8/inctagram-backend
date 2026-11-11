import { Test, type TestingModule } from '@nestjs/testing';
import { CqrsModule, QueryBus } from '@nestjs/cqrs';
import type { ClientGrpc } from '@nestjs/microservices';
import { randomUUID } from 'node:crypto';
import { Observable, of, throwError } from 'rxjs';
import { IsolatedAdminDatabase } from '../../../main-gateway-service/test/superadmin/isolated-admin-database';
import { createIsolatedPostDatabase } from '../isolated-post-database';
import type { PrismaClient } from '../../src/core/prisma/client';
import type { PrismaService } from '../../src/core/prisma/prisma.service';
import { FileGrpcClient } from '../../src/modules/posts/infrastructure/grpc/file-grpc.client';
import { SuperadminPostFilesAdapter } from '../../src/modules/posts/infrastructure/grpc/superadmin-post-files.adapter';
import { SuperadminPostFiles } from '../../src/modules/posts/application/ports/superadmin-posts-read.port';
import {
  SuperadminUserPhotosRead,
  type SuperadminUserPhotosPage,
} from '../../src/modules/posts/application/ports/superadmin-user-photos.port';
import { SuperadminUserPhotosMapper } from '../../src/modules/posts/application/mappers/superadmin-user-photos.mapper';
import {
  GetSuperadminUserPhotosHandler,
  GetSuperadminUserPhotosQuery,
} from '../../src/modules/posts/application/queries/get-superadmin-user-photos.query';
import { SuperadminUserPhotosQueryRepository } from '../../src/modules/posts/infrastructure/repositories/superadmin-user-photos.query-repository';
import type {
  GetFilesDataRequest,
  GetFilesDataResponse,
} from '../../../../libs/contracts/src/generated/file';

describe('U1 photos: isolated Post PostgreSQL and File transport double', () => {
  jest.setTimeout(120000);
  const database = new IsolatedAdminDatabase();
  let post: PrismaClient;
  let module: TestingModule;
  let queryBus: QueryBus;
  const fileRpc = jest.fn(
    (request: GetFilesDataRequest): Observable<GetFilesDataResponse> =>
      of({
        files: Object.fromEntries(
          request.fileIds.map((fileId) => [
            fileId,
            { fileId, fileUrl: `https://files.fixture.test/${fileId}` },
          ]),
        ),
      }),
  );
  const photos = (userId: string, page = 1, pageSize = 2): Promise<SuperadminUserPhotosPage> =>
    queryBus.execute(new GetSuperadminUserPhotosQuery({ userId, page, pageSize }));
  beforeAll(async () => {
    await database.start();
    post = createIsolatedPostDatabase({ database, beforeProjectionMigration: () => undefined });
    const client = new FileGrpcClient({
      getService: () => ({ getFilesData: fileRpc }),
    } as unknown as ClientGrpc);
    module = await Test.createTestingModule({
      imports: [CqrsModule],
      providers: [
        GetSuperadminUserPhotosHandler,
        SuperadminUserPhotosMapper,
        {
          provide: SuperadminUserPhotosRead,
          useValue: new SuperadminUserPhotosQueryRepository(post as PrismaService),
        },
        { provide: SuperadminPostFiles, useValue: new SuperadminPostFilesAdapter(client) },
      ],
    }).compile();
    await module.init();
    queryBus = module.get(QueryBus);
  });
  beforeEach(async () => {
    fileRpc.mockReset();
    fileRpc.mockImplementation((request) =>
      of({
        files: Object.fromEntries(
          request.fileIds.map((fileId) => [
            fileId,
            { fileId, fileUrl: `https://files.fixture.test/${fileId}` },
          ]),
        ),
      }),
    );
    await post.post.deleteMany();
  });
  afterAll(async () => {
    await module?.close();
    await post?.$disconnect();
    await database.stop();
  });

  it('paginates images within posts, counts consistently and ignores other/deleted posts without projection readiness', async () => {
    const owner = randomUUID();
    const date = new Date('2026-10-26T12:00:00Z');
    const lower = '00000000-0000-4000-8000-000000000001';
    const upper = '00000000-0000-4000-8000-000000000002';
    const images = [1, 2, 3].map((n) => ({
      id: `00000000-0000-4000-9000-00000000000${n}`,
      fileId: randomUUID(),
      order: n === 3 ? 1 : 0,
    }));
    await post.post.create({
      data: {
        id: upper,
        ownerId: owner,
        description: '',
        createdAt: date,
        images: { create: images },
      },
    });
    const olderImage = randomUUID();
    await post.post.create({
      data: {
        id: lower,
        ownerId: owner,
        description: '',
        createdAt: date,
        images: { create: { id: olderImage, fileId: randomUUID(), order: 0 } },
      },
    });
    await post.post.create({
      data: {
        ownerId: owner,
        description: '',
        deletedAt: date,
        images: { create: { fileId: randomUUID(), order: 0 } },
      },
    });
    await post.post.create({
      data: {
        ownerId: randomUUID(),
        description: '',
        images: { create: { fileId: randomUUID(), order: 0 } },
      },
    });
    const first = await photos(owner);
    const second = await photos(owner, 2);
    const outside = await photos(owner, 3);
    expect(first.items.map((item) => item.imageId)).toEqual(
      images.slice(0, 2).map((image) => image.id),
    );
    expect(second.items.map((item) => item.imageId)).toEqual([images[2].id, olderImage]);
    expect(first.items.every((item) => item.postId === upper)).toBe(true);
    expect(first).toMatchObject({
      totalCount: 4,
      pageInfo: { page: 1, pageSize: 2, pagesCount: 2, hasNextPage: true },
    });
    expect(outside).toMatchObject({
      items: [],
      totalCount: 4,
      pageInfo: { page: 3, pagesCount: 2, hasNextPage: false },
    });
    expect(fileRpc).toHaveBeenCalledTimes(2);
    const empty = await photos(randomUUID());
    expect(empty.totalCount).toBe(0);
    expect(empty.pageInfo.pagesCount).toBe(0);
    expect(fileRpc).toHaveBeenCalledTimes(2);
    await expect(photos(owner, 0)).rejects.toMatchObject({ code: 400 });
  });

  it('preserves missing tiles, rejects outage and cancels the timed out File request', async () => {
    const owner = randomUUID();
    const ids = [randomUUID(), randomUUID()];
    await post.post.create({
      data: {
        ownerId: owner,
        description: '',
        images: { create: ids.map((fileId, order) => ({ fileId, order })) },
      },
    });
    fileRpc.mockImplementationOnce(() =>
      of({ files: { [ids[0]]: { fileId: ids[0], fileUrl: 'https://files.fixture.test/first' } } }),
    );
    const result = await photos(owner);
    expect(result.items.map((item) => item.url)).toEqual([
      'https://files.fixture.test/first',
      null,
    ]);
    expect(fileRpc).toHaveBeenCalledTimes(1);
    fileRpc.mockImplementationOnce(() => throwError(() => new Error('fixture unavailable')));
    await expect(photos(owner)).rejects.toMatchObject({ code: 503, reason: 'FILES' });
    let cancelled = false;
    fileRpc.mockImplementationOnce(
      () =>
        new Observable(() => () => {
          cancelled = true;
        }),
    );
    await expect(photos(owner)).rejects.toMatchObject({ code: 503, reason: 'FILES' });
    expect(cancelled).toBe(true);
  });

  it('examines the SQL plan with 1000 posts and 3000 images', async () => {
    const owner = randomUUID();
    const posts = Array.from({ length: 1000 }, () => ({
      id: randomUUID(),
      ownerId: owner,
      description: '',
    }));
    await post.post.createMany({ data: posts });
    await post.postImage.createMany({
      data: posts.flatMap((row) =>
        [0, 1, 2].map((order) => ({ postId: row.id, fileId: randomUUID(), order })),
      ),
    });
    const plan = await post.$queryRawUnsafe<{ 'QUERY PLAN': string }[]>(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      WITH photos AS MATERIALIZED (SELECT p."createdAt", p."id" AS "postId", i."id" AS "imageId", i."fileId", i."order" FROM "Post" p JOIN "PostImage" i ON i."postId" = p."id" WHERE p."ownerId" = $1::uuid AND p."deletedAt" IS NULL), selected AS (SELECT * FROM photos ORDER BY "createdAt" DESC, "postId" DESC, "order" ASC, "imageId" ASC LIMIT 50 OFFSET 1000) SELECT (SELECT count(*) FROM photos) AS "totalCount", selected."imageId", selected."postId", selected."fileId" FROM (SELECT 1) seed LEFT JOIN selected ON true ORDER BY selected."createdAt" DESC, selected."postId" DESC, selected."order" ASC, selected."imageId" ASC`,
      owner,
    );
    console.log(
      'U1_EXPLAIN',
      plan
        .map((row) => row['QUERY PLAN'])
        .filter((line) =>
          /Planning Time|Execution Time|Buffers:|Scan on|Sort Method|Join/.test(line),
        )
        .join(' | '),
    );
    expect((await photos(owner, 21, 50)).totalCount).toBe(3000);
  });
});
