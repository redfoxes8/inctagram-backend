import { TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import { randomUUID } from 'crypto';
import { createTestApp } from '../test-app.factory';
import { prepareTestDatabase, resetTestDatabase } from '../reset-db';
import { PostsModule } from '../../src/modules/posts/posts.module';
import { CreatePostCommand } from '../../src/modules/posts/application/commands/create-post.command';
import { CreatePostDto } from '../../src/modules/posts/application/dto/create-post.dto';
import { CreatePostHandler } from '../../src/modules/posts/application/commands/create-post.handler';
import { PostCommandRepository } from '../../src/modules/posts/infrastructure/repositories/post.command-repository';
import { FileStatus } from '../../../../libs/contracts/src/generated/file';

describe('Create Post Integration', () => {
  let module: TestingModule;

  beforeAll(async () => {
    await prepareTestDatabase();

    // Provide a lightweight fake gRPC client only for file service validation.
    // This preserves all real repositories/services and Prisma.
    const fakeFileClient = {
      getService: () => ({
        getFileStatus: (req: any) =>
          of({
            file: {
              id: req.fileId,
              ownerId: currentOwnerId,
              status: FileStatus.UPLOADED,
              fileUrl: 'http://example.local/file/' + req.fileId,
              fileType: 2,
              fileSize: 123,
            },
          }),
      }),
    };

    // currentOwnerId must be defined before fake client uses it
    // We'll set it here and reuse in the test
    globalThis['currentOwnerId'] = randomUUID();
    const providerOverride = {
      provide: 'FILE_SERVICE_PACKAGE',
      useValue: fakeFileClient,
    };

    module = await createTestApp(
      { imports: [PostsModule], providers: [providerOverride] },
      {
        PORT: '3004',
        GRPC_PORT: '50051',
        RABBITMQ_URL: 'amqp://localhost',
        FILE_SERVICE_GRPC_URL: 'localhost:50051',
      },
    );

    // Initialize module so lifecycle hooks (Prisma connect, handlers onModuleInit) run
    await module.init();

    // Override the internal fileService reference on the handler to use our fake service.
    // This avoids network gRPC calls while keeping all domain/repository logic real.
    const handler = module.get(CreatePostHandler);
    if (handler) {
      try {
        // @ts-expect-error set private field for testing
        handler.fileService = fakeFileClient.getService();
      } catch (e) {
        // If we cannot set, let the test run and record friction if it fails.
      }
    }
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterAll(async () => {
    try {
      await module.close();
    } catch (err) {
      // ignore
    }
  });

  it('should create a post and persist related images (happy-path)', async () => {
    const ownerId: string = globalThis['currentOwnerId'];
    const fileId = randomUUID();

    const dto: CreatePostDto = {
      ownerId,
      description: 'Integration test post',
      images: [{ fileId }],
    };

    const handler = module.get(CreatePostHandler);
    expect(handler).toBeDefined();

    // Execute the command (this will call the fake file service for validation)
    const postId = await handler.execute(new CreatePostCommand(dto));
    expect(postId).toBeTruthy();

    // Verify persisted state via real repository (which uses Prisma)
    const repo = module.get(PostCommandRepository);
    const post = await repo.findById(postId);

    expect(post).not.toBeNull();
    expect(post!.id).toEqual(postId);
    expect(post!.ownerId).toEqual(ownerId);
    expect(post!.description).toEqual(dto.description);
    expect(post!.images).toHaveLength(1);
    expect(post!.images[0].fileId).toEqual(fileId);
    expect(post!.images[0].order).toBe(0);
    expect(post!.createdAt).toBeDefined();
  });
});
