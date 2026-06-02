import { TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import { randomUUID } from 'crypto';
import { createTestApp } from '../test-app.factory';
import { prepareTestDatabase, resetTestDatabase } from '../reset-db';
import { PostsModule } from '../../src/modules/posts/posts.module';
import { CreatePostHandler } from '../../src/modules/posts/application/commands/create-post.handler';
import { CreatePostDto } from '../../src/modules/posts/application/dto/create-post.dto';
import { PrismaService } from '../../src/core/prisma/prisma.service';

describe('gRPC Failure Handling Integration', () => {
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

  it('should fail create post when file service is unavailable and not persist anything', async () => {
    const ownerId = randomUUID();
    const fileId = randomUUID();

    // Provide a fake fileService that errors for validation
    const fakeFileClient = {
      getService: () => ({
        getFileStatus: () => throwError(() => new Error('simulated network failure')),
      }),
    };

    // Replace handler.fileService after init (non-invasive)
    const handler = module.get(CreatePostHandler);
    // @ts-expect-error
    handler.fileService = fakeFileClient.getService();

    const dto: CreatePostDto = { ownerId, description: "won't be persisted", images: [{ fileId }] };

    await expect(
      handler.execute({
        ownerId: dto.ownerId,
        description: dto.description,
        images: dto.images,
      } as any),
    ).rejects.toThrow();

    // Verify DB has no posts
    const p = module.get(PrismaService);
    const rows = await p.post.findMany({ where: { ownerId } });
    expect(rows.length).toBe(0);
  });
});
