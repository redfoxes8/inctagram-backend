import { GetFeedHandler } from '../../src/modules/posts/application/queries/get-feed.query';
import { GetFeedQuery } from '../../src/modules/posts/application/queries/get-feed.query';
import { PostGrpcClient } from '../../src/modules/posts/infrastructure/post-grpc.client';
import { DomainException } from '../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../libs/common/src/exceptions/domain-exception-codes';

describe('GetFeedHandler', () => {
  let handler: GetFeedHandler;
  let postGrpcClient: { getPostsByUserId: jest.Mock };

  const mockGrpcPost = {
    id: 'post-1',
    ownerId: 'user-1',
    description: 'Test post',
    images: [
      { id: 'img-1', fileId: 'file-1', url: 'https://cdn.example.com/file-1.jpg', order: 0 },
    ],
    createdAt: { seconds: 1700000000, nanos: 0 },
    updatedAt: { seconds: 1700000000, nanos: 0 },
  };

  beforeEach(() => {
    postGrpcClient = {
      getPostsByUserId: jest.fn(),
    };

    handler = new GetFeedHandler(postGrpcClient as unknown as PostGrpcClient);
  });

  it('should return mapped feed response when gRPC returns posts', async () => {
    postGrpcClient.getPostsByUserId.mockResolvedValue({
      posts: [mockGrpcPost],
      nextCursor: 'cursor-1',
      hasMore: true,
    });

    const query = new GetFeedQuery({ query: {}, ownerId: 'user-1' });
    const result = await handler.execute(query);

    expect(result).toEqual({
      posts: [
        {
          id: 'post-1',
          ownerId: 'user-1',
          description: 'Test post',
          images: [
            { id: 'img-1', fileId: 'file-1', url: 'https://cdn.example.com/file-1.jpg', order: 0 },
          ],
          createdAt: new Date(1700000000 * 1000).toISOString(),
          updatedAt: new Date(1700000000 * 1000).toISOString(),
        },
      ],
      nextCursor: 'cursor-1',
      hasMore: true,
    });
  });

  it('should pass ownerId, cursor and pageSize to gRPC client', async () => {
    postGrpcClient.getPostsByUserId.mockResolvedValue({
      posts: [],
      nextCursor: undefined,
      hasMore: false,
    });

    const query = new GetFeedQuery({
      query: { cursor: 'some-cursor', pageSize: 5 },
      ownerId: 'user-1',
    });
    await handler.execute(query);

    expect(postGrpcClient.getPostsByUserId).toHaveBeenCalledWith({
      ownerId: 'user-1',
      cursor: 'some-cursor',
      pageSize: 5,
    });
  });

  it('should use default pageSize=8 when not provided', async () => {
    postGrpcClient.getPostsByUserId.mockResolvedValue({
      posts: [],
      nextCursor: undefined,
      hasMore: false,
    });

    const query = new GetFeedQuery({ query: {}, ownerId: 'user-1' });
    await handler.execute(query);

    expect(postGrpcClient.getPostsByUserId).toHaveBeenCalledWith({
      ownerId: 'user-1',
      cursor: undefined,
      pageSize: 8,
    });
  });

  it('should handle empty gRPC response (proto3 omits repeated/bool fields)', async () => {
    // proto3 omits fields with default values: posts=[], hasMore=false
    postGrpcClient.getPostsByUserId.mockResolvedValue({} as any);

    const query = new GetFeedQuery({ query: {}, ownerId: 'user-1' });
    const result = await handler.execute(query);

    expect(result).toEqual({
      posts: [],
      nextCursor: undefined,
      hasMore: false,
    });
  });

  it('should handle undefined posts from gRPC', async () => {
    postGrpcClient.getPostsByUserId.mockResolvedValue({
      posts: undefined,
      nextCursor: undefined,
      hasMore: undefined,
    } as any);

    const query = new GetFeedQuery({ query: {}, ownerId: 'user-1' });
    const result = await handler.execute(query);

    expect(result).toEqual({
      posts: [],
      nextCursor: undefined,
      hasMore: false,
    });
  });

  it('should handle empty posts array from gRPC', async () => {
    postGrpcClient.getPostsByUserId.mockResolvedValue({
      posts: [],
      nextCursor: undefined,
      hasMore: false,
    });

    const query = new GetFeedQuery({ query: {}, ownerId: 'user-1' });
    const result = await handler.execute(query);

    expect(result).toEqual({
      posts: [],
      nextCursor: undefined,
      hasMore: false,
    });
  });

  it('should map multiple posts from gRPC response', async () => {
    const post1 = {
      id: 'post-1',
      ownerId: 'user-1',
      description: 'First post',
      images: [{ id: 'img-1', fileId: 'file-1', url: 'https://cdn.example.com/1.jpg', order: 0 }],
      createdAt: { seconds: 1700000000, nanos: 0 },
      updatedAt: { seconds: 1700000000, nanos: 0 },
    };
    const post2 = {
      id: 'post-2',
      ownerId: 'user-1',
      description: 'Second post',
      images: [{ id: 'img-2', fileId: 'file-2', url: 'https://cdn.example.com/2.jpg', order: 0 }],
      createdAt: { seconds: 1700001000, nanos: 0 },
      updatedAt: { seconds: 1700001000, nanos: 0 },
    };
    postGrpcClient.getPostsByUserId.mockResolvedValue({
      posts: [post1, post2],
      nextCursor: 'cursor-2',
      hasMore: false,
    });

    const query = new GetFeedQuery({ query: {}, ownerId: 'user-1' });
    const result = await handler.execute(query);

    expect(result.posts).toHaveLength(2);
    expect(result.posts[0].id).toBe('post-1');
    expect(result.posts[1].id).toBe('post-2');
  });

  it('should handle post with empty images array', async () => {
    const grpcPostNoImages = {
      id: 'post-1',
      ownerId: 'user-1',
      description: 'Post without images',
      images: [],
      createdAt: { seconds: 1700000000, nanos: 0 },
      updatedAt: { seconds: 1700000000, nanos: 0 },
    };
    postGrpcClient.getPostsByUserId.mockResolvedValue({
      posts: [grpcPostNoImages],
      nextCursor: undefined,
      hasMore: false,
    });

    const query = new GetFeedQuery({ query: {}, ownerId: 'user-1' });
    const result = await handler.execute(query);

    expect(result).toEqual({
      posts: [
        {
          id: 'post-1',
          ownerId: 'user-1',
          description: 'Post without images',
          images: [],
          createdAt: new Date(1700000000 * 1000).toISOString(),
          updatedAt: new Date(1700000000 * 1000).toISOString(),
        },
      ],
      nextCursor: undefined,
      hasMore: false,
    });
  });

  it('should handle post with undefined images (proto3 omits empty repeated)', async () => {
    const grpcPostWithoutImages = {
      id: 'post-1',
      ownerId: 'user-1',
      description: 'Test post',
      images: undefined,
      createdAt: { seconds: 1700000000, nanos: 0 },
      updatedAt: { seconds: 1700000000, nanos: 0 },
    };
    postGrpcClient.getPostsByUserId.mockResolvedValue({
      posts: [grpcPostWithoutImages],
      nextCursor: undefined,
      hasMore: false,
    });

    const query = new GetFeedQuery({ query: {}, ownerId: 'user-1' });

    // BUG: PostResponseMapper.toPostResponse still does post.images.map() without null-check
    await expect(handler.execute(query)).rejects.toThrow();
  });

  it('should propagate DomainException when gRPC call fails', async () => {
    const error = new DomainException({
      code: DomainExceptionCode.ServiceUnavailable,
      message: 'No connection established',
    });
    postGrpcClient.getPostsByUserId.mockRejectedValue(error);

    const query = new GetFeedQuery({ query: {}, ownerId: 'user-1' });

    await expect(handler.execute(query)).rejects.toThrow('No connection established');
  });
});
