import { GetLatestPostsHandler, GetLatestPostsQuery } from '../../src/modules/posts/application/queries/get-latest-posts.query';
import { PostQueryRepository } from '../../src/modules/posts/infrastructure/repositories/post.query-repository';
import { FileGrpcClient } from '../../src/modules/posts/infrastructure/grpc/file-grpc.client';
import { makePost, makePostImage } from '../factories/post-test.factory';

describe('GetLatestPostsHandler (Unit)', () => {
  let handler: GetLatestPostsHandler;
  let postQueryRepositoryMock: jest.Mocked<PostQueryRepository>;
  let fileGrpcClientMock: jest.Mocked<FileGrpcClient>;

  beforeEach(async () => {
    postQueryRepositoryMock = {
      getLatestPosts: jest.fn(),
    } as any;

    fileGrpcClientMock = {
      getFilesByIds: jest.fn(),
    } as any;

    handler = new GetLatestPostsHandler(postQueryRepositoryMock, fileGrpcClientMock);
  });

  it('should successfully retrieve latest posts and map them with URLs', async () => {
    const query = new GetLatestPostsQuery({ limit: 2 });
    const fileId1 = 'file-1';
    const fileId2 = 'file-2';
    const post1 = makePost({
      id: 'post-1',
      description: 'Desc 1',
      images: [makePostImage({ fileId: fileId1, order: 0 })],
    });
    const post2 = makePost({
      id: 'post-2',
      description: 'Desc 2',
      images: [makePostImage({ fileId: fileId2, order: 0 })],
    });

    postQueryRepositoryMock.getLatestPosts.mockResolvedValue([post1, post2]);
    fileGrpcClientMock.getFilesByIds.mockResolvedValue({
      files: {
        [fileId1]: { fileId: fileId1, fileUrl: 'https://cdn.com/post1.jpg' },
        [fileId2]: { fileId: fileId2, fileUrl: 'https://cdn.com/post2.jpg' },
      },
    } as any);

    const result = await handler.execute(query);

    expect(result).toHaveLength(2);
    expect(postQueryRepositoryMock.getLatestPosts).toHaveBeenCalledWith(2);
    expect(fileGrpcClientMock.getFilesByIds).toHaveBeenCalledWith({
      fileIds: [fileId1, fileId2],
    });
    expect(result[0].images[0].url).toBe('https://cdn.com/post1.jpg');
    expect(result[1].images[0].url).toBe('https://cdn.com/post2.jpg');
  });

  it('should return empty array when there are no posts', async () => {
    const query = new GetLatestPostsQuery({ limit: 1 });
    postQueryRepositoryMock.getLatestPosts.mockResolvedValue([]);

    const result = await handler.execute(query);

    expect(result).toEqual([]);
    expect(fileGrpcClientMock.getFilesByIds).not.toHaveBeenCalled();
  });

  it('should skip file-ms call when posts exist but have no images', async () => {
    const query = new GetLatestPostsQuery({ limit: 1 });
    const post = makePost({ id: 'post-1', description: 'Desc 1', images: [] });
    postQueryRepositoryMock.getLatestPosts.mockResolvedValue([post]);

    const result = await handler.execute(query);

    expect(result).toHaveLength(1);
    expect(result[0].images).toHaveLength(0);
    expect(fileGrpcClientMock.getFilesByIds).not.toHaveBeenCalled();
  });
});
