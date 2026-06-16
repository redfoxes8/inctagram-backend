import { GetLatestPostsHandler } from '../../src/modules/posts/application/queries/get-latest-posts.query';
import { GetLatestPostsQuery } from '../../src/modules/posts/application/queries/get-latest-posts.query';
import { IPostGrpcAdapter } from '../../src/modules/posts/infrastructure/interfaces/post-grpc-adapter.interface';
import { DomainException } from '../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../libs/common/src/exceptions/domain-exception-codes';

describe('GetLatestPostsHandler', () => {
  let handler: GetLatestPostsHandler;
  let postGrpcAdapter: { getLatestPosts: jest.Mock };

  const mockPostView = {
    id: 'post-1',
    ownerId: 'user-1',
    description: 'Test post',
    images: [{ id: 'img-1', fileId: 'file-1', url: 'https://cdn.example.com/1.jpg', order: 0 }],
    createdAt: new Date(1700000000 * 1000),
    updatedAt: new Date(1700000000 * 1000),
  };

  beforeEach(() => {
    postGrpcAdapter = {
      getLatestPosts: jest.fn(),
    };

    handler = new GetLatestPostsHandler(postGrpcAdapter as unknown as IPostGrpcAdapter);
  });

  it('should return posts from adapter', async () => {
    postGrpcAdapter.getLatestPosts.mockResolvedValue([mockPostView]);

    const query = new GetLatestPostsQuery({ limit: 4 });
    const result = await handler.execute(query);

    expect(result).toEqual([mockPostView]);
  });

  it('should pass query dto to adapter', async () => {
    postGrpcAdapter.getLatestPosts.mockResolvedValue([]);

    const query = new GetLatestPostsQuery({ limit: 8 });
    await handler.execute(query);

    expect(postGrpcAdapter.getLatestPosts).toHaveBeenCalledWith({ limit: 8 });
  });

  it('should use default limit when not provided', async () => {
    postGrpcAdapter.getLatestPosts.mockResolvedValue([]);

    const query = new GetLatestPostsQuery({});
    await handler.execute(query);

    expect(postGrpcAdapter.getLatestPosts).toHaveBeenCalledWith({});
  });

  it('should return null when adapter returns null (no posts)', async () => {
    postGrpcAdapter.getLatestPosts.mockResolvedValue(null);

    const query = new GetLatestPostsQuery({ limit: 4 });
    const result = await handler.execute(query);

    expect(result).toBeNull();
  });

  it('should return empty array when adapter returns empty array', async () => {
    postGrpcAdapter.getLatestPosts.mockResolvedValue([]);

    const query = new GetLatestPostsQuery({ limit: 4 });
    const result = await handler.execute(query);

    expect(result).toEqual([]);
  });

  it('should return multiple posts', async () => {
    const post1 = { ...mockPostView, id: 'post-1' };
    const post2 = { ...mockPostView, id: 'post-2' };
    postGrpcAdapter.getLatestPosts.mockResolvedValue([post1, post2]);

    const query = new GetLatestPostsQuery({ limit: 4 });
    const result = await handler.execute(query);

    expect(result).toHaveLength(2);
    expect(result![0].id).toBe('post-1');
    expect(result![1].id).toBe('post-2');
  });

  it('should propagate DomainException when adapter fails', async () => {
    const error = new DomainException({
      code: DomainExceptionCode.ServiceUnavailable,
      message: 'Post service unavailable',
    });
    postGrpcAdapter.getLatestPosts.mockRejectedValue(error);

    const query = new GetLatestPostsQuery({ limit: 4 });

    await expect(handler.execute(query)).rejects.toThrow('Post service unavailable');
  });
});
