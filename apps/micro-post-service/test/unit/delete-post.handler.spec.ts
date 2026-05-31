import { randomUUID } from 'crypto';
import { DeletePostHandler } from '../../src/modules/posts/application/commands/delete-post.handler';
import { PostCommandRepository } from '../../src/modules/posts/infrastructure/repositories/post.command-repository';
import { DeletePostCommand } from '../../src/modules/posts/application/commands/delete-post.command';
import { DomainException, DomainExceptionCode } from '../../../../libs/common/src';
import { makePost } from '../factories/post-test.factory';

describe('DeletePostHandler (Unit)', () => {
  let handler: DeletePostHandler;
  let postRepositoryMock: jest.Mocked<PostCommandRepository>;

  beforeEach(async () => {
    // Arrange: Create mock for repository
    postRepositoryMock = {
      createPost: jest.fn(),
      findById: jest.fn(),
      updatePost: jest.fn(),
      deletePost: jest.fn().mockResolvedValue(undefined),
    } as any;

    handler = new DeletePostHandler(postRepositoryMock);
  });

  it('should successfully delete a post when owner and post are valid', async () => {
    // Arrange
    const ownerId = randomUUID();
    const postId = randomUUID();
    const existingPost = makePost({ id: postId, ownerId });
    const command = new DeletePostCommand(postId, ownerId);

    postRepositoryMock.findById.mockResolvedValue(existingPost);

    // Act
    await handler.execute(command);

    // Assert
    expect(postRepositoryMock.findById).toHaveBeenCalledWith(postId);
    expect(postRepositoryMock.deletePost).toHaveBeenCalledWith(postId);
  });

  it('should throw DomainException NotFound if post does not exist', async () => {
    // Arrange
    const ownerId = randomUUID();
    const postId = randomUUID();
    const command = new DeletePostCommand(postId, ownerId);

    postRepositoryMock.findById.mockResolvedValue(null);

    // Act & Assert
    await expect(handler.execute(command)).rejects.toThrow(
      new DomainException({
        code: DomainExceptionCode.NotFound,
        message: 'Post not found',
      }),
    );
    expect(postRepositoryMock.deletePost).not.toHaveBeenCalled();
  });

  it('should throw DomainException Forbidden if ownerId does not match the post owner', async () => {
    // Arrange
    const ownerId = randomUUID();
    const wrongOwnerId = randomUUID();
    const postId = randomUUID();
    const existingPost = makePost({ id: postId, ownerId });
    const command = new DeletePostCommand(postId, wrongOwnerId);

    postRepositoryMock.findById.mockResolvedValue(existingPost);

    // Act & Assert
    await expect(handler.execute(command)).rejects.toThrow(
      new DomainException({
        code: DomainExceptionCode.Forbidden,
        message: 'Forbidden',
      }),
    );
    expect(postRepositoryMock.deletePost).not.toHaveBeenCalled();
  });
});
