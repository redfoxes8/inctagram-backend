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
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { FileStatus } from '../../../../libs/contracts/src/generated/file';

describe('Create Post Integration', () => {
  let module: TestingModule;
  let mockGetFileStatus: jest.Mock;

  beforeAll(async () => {
    await prepareTestDatabase();

    mockGetFileStatus = jest.fn();
    const fakeFileClient = {
      getService: () => ({
        getFileStatus: mockGetFileStatus,
      }),
    };

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

    await module.init();

    const handler = module.get(CreatePostHandler);
    if (handler) {
      try {
        // @ts-expect-error set private field for testing
        handler.fileService = fakeFileClient.getService();
      } catch (e) {}
    }
  });

  beforeEach(async () => {
    await resetTestDatabase();
    mockGetFileStatus.mockReset();
  });

  afterAll(async () => {
    try {
      await module.close();
    } catch (err) {}
  });

  it('should create a post and persist related images (happy-path)', async () => {
    // Arrange
    const ownerId = randomUUID();
    const fileId = randomUUID();
    mockGetFileStatus.mockReturnValue(
      of({
        file: {
          id: fileId,
          ownerId,
          status: FileStatus.UPLOADED,
        },
      }),
    );

    const dto: CreatePostDto = {
      ownerId,
      description: 'Integration test post',
      images: [{ fileId }],
    };

    const handler = module.get(CreatePostHandler);

    // Act
    const postId = await handler.execute(new CreatePostCommand(dto));

    // Assert
    expect(postId).toBeTruthy();
    const repo = module.get(PostCommandRepository);
    const post = await repo.findById(postId);

    expect(post).not.toBeNull();
    expect(post!.id).toEqual(postId);
    expect(post!.ownerId).toEqual(ownerId);
    expect(post!.description).toEqual(dto.description);
    expect(post!.images).toHaveLength(1);
    expect(post!.images[0].fileId).toEqual(fileId);
  });

  it('should fail and not persist anything when images list is empty', async () => {
    // Arrange
    const ownerId = randomUUID();
    const dto: CreatePostDto = {
      ownerId,
      description: 'No images post',
      images: [],
    };
    const handler = module.get(CreatePostHandler);

    // Act & Assert
    await expect(handler.execute(new CreatePostCommand(dto))).rejects.toThrow();

    // Verify DB remains clean
    const prisma = module.get(PrismaService);
    const count = await prisma.post.count({ where: { ownerId } });
    expect(count).toBe(0);
  });

  it('should fail and not persist anything when file belongs to a different owner', async () => {
    // Arrange
    const ownerId = randomUUID();
    const fileId = randomUUID();
    const differentOwnerId = randomUUID();

    mockGetFileStatus.mockReturnValue(
      of({
        file: {
          id: fileId,
          ownerId: differentOwnerId,
          status: FileStatus.UPLOADED,
        },
      }),
    );

    const dto: CreatePostDto = {
      ownerId,
      description: 'Forbidden ownership',
      images: [{ fileId }],
    };
    const handler = module.get(CreatePostHandler);

    // Act & Assert
    await expect(handler.execute(new CreatePostCommand(dto))).rejects.toThrow(/does not belong to user/);

    // Verify DB remains clean
    const prisma = module.get(PrismaService);
    const count = await prisma.post.count({ where: { ownerId } });
    expect(count).toBe(0);
  });

  it('should fail and not persist anything when file status is not UPLOADED', async () => {
    // Arrange
    const ownerId = randomUUID();
    const fileId = randomUUID();

    mockGetFileStatus.mockReturnValue(
      of({
        file: {
          id: fileId,
          ownerId,
          status: FileStatus.PENDING,
        },
      }),
    );

    const dto: CreatePostDto = {
      ownerId,
      description: 'Pending file',
      images: [{ fileId }],
    };
    const handler = module.get(CreatePostHandler);

    // Act & Assert
    await expect(handler.execute(new CreatePostCommand(dto))).rejects.toThrow(/is not uploaded yet/);

    // Verify DB remains clean
    const prisma = module.get(PrismaService);
    const count = await prisma.post.count({ where: { ownerId } });
    expect(count).toBe(0);
  });

  it('should roll back transaction completely if one image in a batch fails validation', async () => {
    // Arrange
    const ownerId = randomUUID();
    const fileIdValid = randomUUID();
    const fileIdInvalid = randomUUID();

    // First image is valid, second belongs to someone else
    mockGetFileStatus
      .mockReturnValueOnce(
        of({
          file: {
            id: fileIdValid,
            ownerId,
            status: FileStatus.UPLOADED,
          },
        }),
      )
      .mockReturnValueOnce(
        of({
          file: {
            id: fileIdInvalid,
            ownerId: 'someone-else',
            status: FileStatus.UPLOADED,
          },
        }),
      );

    const dto: CreatePostDto = {
      ownerId,
      description: 'Rollback verification',
      images: [{ fileId: fileIdValid }, { fileId: fileIdInvalid }],
    };
    const handler = module.get(CreatePostHandler);

    // Act & Assert
    await expect(handler.execute(new CreatePostCommand(dto))).rejects.toThrow(/does not belong to user/);

    // Verify DB remains clean (rollback of any potential partial post inserts)
    const prisma = module.get(PrismaService);
    const count = await prisma.post.count({ where: { ownerId } });
    expect(count).toBe(0);
  });
});
