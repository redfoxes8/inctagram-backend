import { of, throwError } from 'rxjs';
import { randomUUID } from 'crypto';
import { CreatePostHandler } from '../../src/modules/posts/application/commands/create-post.handler';
import { PostCommandRepository } from '../../src/modules/posts/infrastructure/repositories/post.command-repository';
import { CreatePostCommand } from '../../src/modules/posts/application/commands/create-post.command';
import { DomainException, DomainExceptionCode } from '../../../../libs/common/src';
import { FileStatus } from '../../../../libs/contracts/src/generated/file';

describe('CreatePostHandler (Unit)', () => {
  let handler: CreatePostHandler;
  let postRepositoryMock: jest.Mocked<PostCommandRepository>;
  let fileServiceClientMock: any;
  let fileServiceMock: any;

  beforeEach(async () => {
    // Arrange: Create mocks
    postRepositoryMock = {
      createPost: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(),
      updatePost: jest.fn(),
      deletePost: jest.fn(),
    } as any;

    fileServiceMock = {
      getFileStatus: jest.fn(),
    };

    fileServiceClientMock = {
      getService: jest.fn().mockReturnValue(fileServiceMock),
    };

    handler = new CreatePostHandler(fileServiceClientMock, postRepositoryMock);
    handler.onModuleInit();
  });

  it('should successfully create and persist a post when image checks pass', async () => {
    // Arrange
    const ownerId = randomUUID();
    const fileId = randomUUID();
    const command = new CreatePostCommand({
      ownerId,
      description: 'Test post description',
      images: [{ fileId }],
    });

    fileServiceMock.getFileStatus.mockReturnValue(
      of({
        file: {
          id: fileId,
          ownerId,
          status: FileStatus.UPLOADED,
        },
      }),
    );

    // Act
    const result = await handler.execute(command);

    // Assert
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
    expect(fileServiceMock.getFileStatus).toHaveBeenCalledWith({ fileId });
    expect(postRepositoryMock.createPost).toHaveBeenCalled();
    const createdPost = postRepositoryMock.createPost.mock.calls[0][0];
    expect(createdPost.ownerId).toBe(ownerId);
    expect(createdPost.description).toBe('Test post description');
    expect(createdPost.images).toHaveLength(1);
    expect(createdPost.images[0].fileId).toBe(fileId);
  });

  it('should throw DomainException BadRequest if file is not found', async () => {
    // Arrange
    const ownerId = randomUUID();
    const fileId = randomUUID();
    const command = new CreatePostCommand({
      ownerId,
      description: 'Test post description',
      images: [{ fileId }],
    });

    fileServiceMock.getFileStatus.mockReturnValue(of({ file: null }));

    // Act & Assert
    await expect(handler.execute(command)).rejects.toThrow(
      new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: `File ${fileId} not found`,
      }),
    );
    expect(postRepositoryMock.createPost).not.toHaveBeenCalled();
  });

  it('should throw DomainException BadRequest if file status is not UPLOADED', async () => {
    // Arrange
    const ownerId = randomUUID();
    const fileId = randomUUID();
    const command = new CreatePostCommand({
      ownerId,
      description: 'Test post description',
      images: [{ fileId }],
    });

    fileServiceMock.getFileStatus.mockReturnValue(
      of({
        file: {
          id: fileId,
          ownerId,
          status: FileStatus.PENDING,
        },
      }),
    );

    // Act & Assert
    await expect(handler.execute(command)).rejects.toThrow(
      new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: `File ${fileId} is not uploaded yet`,
      }),
    );
    expect(postRepositoryMock.createPost).not.toHaveBeenCalled();
  });

  it('should throw DomainException Forbidden if file ownerId does not match command ownerId', async () => {
    // Arrange
    const commandOwnerId = randomUUID();
    const fileOwnerId = randomUUID();
    const fileId = randomUUID();
    const command = new CreatePostCommand({
      ownerId: commandOwnerId,
      description: 'Test post description',
      images: [{ fileId }],
    });

    fileServiceMock.getFileStatus.mockReturnValue(
      of({
        file: {
          id: fileId,
          ownerId: fileOwnerId,
          status: FileStatus.UPLOADED,
        },
      }),
    );

    // Act & Assert
    await expect(handler.execute(command)).rejects.toThrow(
      new DomainException({
        code: DomainExceptionCode.Forbidden,
        message: `File ${fileId} does not belong to user`,
      }),
    );
    expect(postRepositoryMock.createPost).not.toHaveBeenCalled();
  });

  it('should throw DomainException BadRequest when fileStatus call fails with an error', async () => {
    // Arrange
    const ownerId = randomUUID();
    const fileId = randomUUID();
    const command = new CreatePostCommand({
      ownerId,
      description: 'Test post description',
      images: [{ fileId }],
    });

    fileServiceMock.getFileStatus.mockReturnValue(
      throwError(() => new Error('gRPC error')),
    );

    // Act & Assert
    await expect(handler.execute(command)).rejects.toThrow(
      new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: `Error validating file ${fileId}: gRPC error`,
      }),
    );
    expect(postRepositoryMock.createPost).not.toHaveBeenCalled();
  });
});
