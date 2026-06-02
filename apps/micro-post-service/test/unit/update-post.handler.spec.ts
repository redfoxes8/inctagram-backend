import { randomUUID } from 'crypto';
import { UpdatePostHandler } from '../../src/modules/posts/application/commands/update-post.handler';
import { PostCommandRepository } from '../../src/modules/posts/infrastructure/repositories/post.command-repository';
import { UpdatePostCommand } from '../../src/modules/posts/application/commands/update-post.command';
import { DomainException, DomainExceptionCode } from '../../../../libs/common/src';
import { makePost } from '../factories/post-test.factory';

describe('UpdatePostHandler (Unit)', () => {
  let handler: UpdatePostHandler;
  let postRepositoryMock: jest.Mocked<PostCommandRepository>;

  beforeEach(async () => {
    // Arrange: Create mock for repository
    postRepositoryMock = {
      createPost: jest.fn(),
      findById: jest.fn(),
      updatePost: jest.fn().mockResolvedValue(undefined),
      deletePost: jest.fn(),
    } as any;

    handler = new UpdatePostHandler(postRepositoryMock);
  });

  it('should successfully update a post description when owner and post are valid', async () => {
    // Arrange
    const ownerId = randomUUID();
    const postId = randomUUID();
    const existingPost = makePost({ id: postId, ownerId, description: 'Old Description' });
    const command = new UpdatePostCommand(
      postId,
      ownerId,
      'New Description',
    );

    postRepositoryMock.findById.mockResolvedValue(existingPost);

    // Act
    await handler.execute(command);

    // Assert
    expect(postRepositoryMock.findById).toHaveBeenCalledWith(postId);
    expect(existingPost.description).toBe('New Description');
    expect(postRepositoryMock.updatePost).toHaveBeenCalledWith(existingPost);
  });

  it('should throw DomainException NotFound if post does not exist', async () => {
    // Arrange
    const ownerId = randomUUID();
    const postId = randomUUID();
    const command = new UpdatePostCommand(
      postId,
      ownerId,
      'New Description',
    );

    postRepositoryMock.findById.mockResolvedValue(null);

    // Act & Assert
    await expect(handler.execute(command)).rejects.toThrow(
      new DomainException({
        code: DomainExceptionCode.NotFound,
        message: 'Post not found',
      }),
    );
    expect(postRepositoryMock.updatePost).not.toHaveBeenCalled();
  });

  it('should throw DomainException Forbidden if ownerId does not match the post owner', async () => {
    // Arrange
    const ownerId = randomUUID();
    const wrongOwnerId = randomUUID();
    const postId = randomUUID();
    const existingPost = makePost({ id: postId, ownerId, description: 'Old Description' });
    const command = new UpdatePostCommand(
      postId,
      wrongOwnerId,
      'New Description',
    );

    postRepositoryMock.findById.mockResolvedValue(existingPost);

    // Act & Assert
    await expect(handler.execute(command)).rejects.toThrow(
      new DomainException({
        code: DomainExceptionCode.Forbidden,
        message: 'Forbidden',
      }),
    );
    expect(postRepositoryMock.updatePost).not.toHaveBeenCalled();
  });
});
