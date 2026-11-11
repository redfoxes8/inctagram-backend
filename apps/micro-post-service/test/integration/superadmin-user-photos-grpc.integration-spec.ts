import { type INestMicroservice } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import {
  ClientProxyFactory,
  Transport,
  type ClientGrpc,
  type ClientProxy,
  type MicroserviceOptions,
} from '@nestjs/microservices';
import { Test, type TestingModule } from '@nestjs/testing';
import { status } from '@grpc/grpc-js';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { firstValueFrom, Observable, of, throwError } from 'rxjs';
import { IsolatedAdminDatabase } from '../../../main-gateway-service/test/superadmin/isolated-admin-database';
import { createIsolatedPostDatabase } from '../isolated-post-database';
import type { PrismaClient } from '../../src/core/prisma/client';
import type { PrismaService } from '../../src/core/prisma/prisma.service';
import { SuperadminPostsGrpcController } from '../../src/modules/posts/api/superadmin-posts-grpc.controller';
import { GetSuperadminUserPhotosHandler } from '../../src/modules/posts/application/queries/get-superadmin-user-photos.query';
import { SuperadminUserPhotosRead } from '../../src/modules/posts/application/ports/superadmin-user-photos.port';
import { SuperadminPostFiles } from '../../src/modules/posts/application/ports/superadmin-posts-read.port';
import { SuperadminUserPhotosMapper } from '../../src/modules/posts/application/mappers/superadmin-user-photos.mapper';
import { SuperadminUserPhotosQueryRepository } from '../../src/modules/posts/infrastructure/repositories/superadmin-user-photos.query-repository';
import { FileGrpcClient } from '../../src/modules/posts/infrastructure/grpc/file-grpc.client';
import { SuperadminPostFilesAdapter } from '../../src/modules/posts/infrastructure/grpc/superadmin-post-files.adapter';
import type {
  GetFilesDataRequest,
  GetFilesDataResponse,
} from '../../../../libs/contracts/src/generated/file';
import type { PostServiceClient } from '../../../../libs/contracts/src/generated/post';

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture port');
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

describe('U2 real Post gRPC and isolated Post DB; File transport double', () => {
  jest.setTimeout(120000);
  const database = new IsolatedAdminDatabase();
  let post: PrismaClient;
  let module: TestingModule;
  let server: INestMicroservice;
  let client: ClientGrpc & ClientProxy;
  let service: PostServiceClient;
  const files = jest.fn(
    (request: GetFilesDataRequest): Observable<GetFilesDataResponse> =>
      of({
        files: Object.fromEntries(
          request.fileIds
            .slice(0, 1)
            .map((fileId) => [fileId, { fileId, fileUrl: `https://files.fixture.test/${fileId}` }]),
        ),
      }),
  );
  beforeAll(async () => {
    await database.start();
    post = createIsolatedPostDatabase({ database, beforeProjectionMigration: () => undefined });
    const fileClient = new FileGrpcClient({
      getService: () => ({ getFilesData: files }),
    } as unknown as ClientGrpc);
    module = await Test.createTestingModule({
      imports: [CqrsModule],
      controllers: [SuperadminPostsGrpcController],
      providers: [
        GetSuperadminUserPhotosHandler,
        SuperadminUserPhotosMapper,
        {
          provide: SuperadminUserPhotosRead,
          useValue: new SuperadminUserPhotosQueryRepository(post as PrismaService),
        },
        { provide: SuperadminPostFiles, useValue: new SuperadminPostFilesAdapter(fileClient) },
      ],
    }).compile();
    const options = {
      package: 'inctagram.post.v1',
      protoPath: join(process.cwd(), 'libs/contracts/src/proto/post.proto'),
      url: `127.0.0.1:${await freePort()}`,
    };
    server = module.createNestMicroservice<MicroserviceOptions>({
      transport: Transport.GRPC,
      options,
    });
    await server.listen();
    client = ClientProxyFactory.create({ transport: Transport.GRPC, options }) as ClientGrpc &
      ClientProxy;
    service = client.getService<PostServiceClient>('PostService');
  });
  afterAll(async () => {
    await client?.close();
    await server?.close();
    await post?.$disconnect();
    await database.stop();
  });
  it('maps a real page and validates input while masking File outage and timeout', async () => {
    const userId = randomUUID();
    const photoFiles = [randomUUID(), randomUUID()];
    const row = await post.post.create({
      data: {
        ownerId: userId,
        description: '',
        images: { create: photoFiles.map((fileId, order) => ({ fileId, order })) },
      },
      include: { images: { orderBy: { order: 'asc' } } },
    });
    const result = await firstValueFrom(
      service.getSuperadminUserPhotos({ userId, page: 1, pageSize: 2 }),
    );
    expect(result).toMatchObject({
      totalCount: 2,
      page: 1,
      pageSize: 2,
      pagesCount: 1,
      hasNextPage: false,
      items: [
        {
          imageId: row.images[0].id,
          postId: row.id,
          url: `https://files.fixture.test/${photoFiles[0]}`,
        },
        { imageId: row.images[1].id, postId: row.id },
      ],
    });
    expect(result.items[1].url).toBeUndefined();
    expect(files).toHaveBeenCalledTimes(1);
    const defaultPage = await firstValueFrom(service.getSuperadminUserPhotos({ userId }));
    expect(defaultPage).toMatchObject({ page: 1, pageSize: 8, totalCount: 2 });
    for (const input of [
      { userId: 'bad', page: 1, pageSize: 2 },
      { userId, page: 0, pageSize: 2 },
      { userId, page: 1, pageSize: 51 },
    ]) {
      await expect(firstValueFrom(service.getSuperadminUserPhotos(input))).rejects.toMatchObject({
        code: status.INVALID_ARGUMENT,
      });
    }
    files.mockImplementationOnce(() => throwError(() => new Error('PRIVATE_FIXTURE_FAILURE')));
    const outage: unknown = await firstValueFrom(service.getSuperadminUserPhotos({ userId })).catch(
      (error) => error,
    );
    expect(outage).toMatchObject({ code: status.UNAVAILABLE });
    expect(JSON.stringify(outage)).not.toContain('PRIVATE_FIXTURE_FAILURE');
    let cancelled = false;
    files.mockImplementationOnce(
      () =>
        new Observable(() => () => {
          cancelled = true;
        }),
    );
    const timeout: unknown = await firstValueFrom(
      service.getSuperadminUserPhotos({ userId }),
    ).catch((error) => error);
    expect(timeout).toMatchObject({ code: status.UNAVAILABLE });
    expect(cancelled).toBe(true);
  });
});
