import {
  GetLatestPostsHandler,
  GetLatestPostsQuery,
} from '../../src/modules/posts/application/queries/get-latest-posts.query';
import { PostQueryRepository } from '../../src/modules/posts/infrastructure/repositories/post.query-repository';
import { GrpcAdapter } from '../../src/modules/posts/infrastructure/grpc/grpc.adapter';
import { makePost, makePostImage } from '../factories/post-test.factory';
import { DomainException } from '../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../libs/common/src/exceptions/domain-exception-codes';

describe('GetLatestPostsHandler (Unit)', () => {
  let handler: GetLatestPostsHandler;
  let postQueryRepositoryMock: jest.Mocked<PostQueryRepository>;
  let grpcAdapterMock: jest.Mocked<GrpcAdapter>;

  beforeEach(async () => {
    postQueryRepositoryMock = {
      getLatestPosts: jest.fn(),
    } as any;

    grpcAdapterMock = {
      getFilesByIds: jest.fn(),
    } as any;

    handler = new GetLatestPostsHandler(postQueryRepositoryMock, grpcAdapterMock);
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
    grpcAdapterMock.getFilesByIds.mockResolvedValue({
      files: {
        [fileId1]: { fileId: fileId1, fileUrl: 'https://cdn.com/post1.jpg' },
        [fileId2]: { fileId: fileId2, fileUrl: 'https://cdn.com/post2.jpg' },
      },
    } as any);

    const postQueryRepositorySpy = jest.spyOn(postQueryRepositoryMock, 'getLatestPosts');
    const grpcAdapterSpy = jest.spyOn(grpcAdapterMock, 'getFilesByIds');

    const result = await handler.execute(query);

    expect(result).toHaveLength(2);
    expect(postQueryRepositorySpy).toHaveBeenCalledWith(2);
    expect(grpcAdapterSpy).toHaveBeenCalledWith({
      fileIds: [fileId1, fileId2],
    });
    expect(result![0].images[0].url).toBe('https://cdn.com/post1.jpg');
    expect(result![1].images[0].url).toBe('https://cdn.com/post2.jpg');
  });

  it('should return null when there are no posts', async () => {
    const query = new GetLatestPostsQuery({ limit: 1 });
    postQueryRepositoryMock.getLatestPosts.mockResolvedValue([]);

    const postQueryRepositorySpy = jest.spyOn(postQueryRepositoryMock, 'getLatestPosts');
    const grpcAdapterSpy = jest.spyOn(grpcAdapterMock, 'getFilesByIds');
    const result = await handler.execute(query);

    expect(result).toBeNull();
    expect(postQueryRepositorySpy).toHaveBeenCalledWith(1);
    expect(grpcAdapterSpy).not.toHaveBeenCalled();
  });

  it('should skip file-ms call when posts exist but have no images', async () => {
    const query = new GetLatestPostsQuery({ limit: 1 });
    const post = makePost({ id: 'post-1', description: 'Desc 1', images: [] });
    postQueryRepositoryMock.getLatestPosts.mockResolvedValue([post]);

    const postQueryRepositorySpy = jest.spyOn(postQueryRepositoryMock, 'getLatestPosts');
    const grpcAdapterSpy = jest.spyOn(grpcAdapterMock, 'getFilesByIds');

    const result = await handler.execute(query);

    expect(result).toHaveLength(1);
    expect(postQueryRepositorySpy).toHaveBeenCalledWith(1);
    expect(result![0].images).toHaveLength(0);
    expect(grpcAdapterSpy).not.toHaveBeenCalled();
  });

  it('should return empty images when grpc adapter returns null', async () => {
    const query = new GetLatestPostsQuery({ limit: 1 });
    const fileId = 'file-1';
    const post = makePost({
      id: 'post-1',
      description: 'Desc 1',
      images: [makePostImage({ fileId, order: 0 })],
    });

    postQueryRepositoryMock.getLatestPosts.mockResolvedValue([post]);
    grpcAdapterMock.getFilesByIds.mockResolvedValue(null);

    const postQueryRepositorySpy = jest.spyOn(postQueryRepositoryMock, 'getLatestPosts');
    const grpcAdapterSpy = jest.spyOn(grpcAdapterMock, 'getFilesByIds');

    const result = await handler.execute(query);

    expect(result).toHaveLength(1);
    expect(postQueryRepositorySpy).toHaveBeenCalledWith(1);
    expect(grpcAdapterSpy).toHaveBeenCalledWith({ fileIds: [fileId] });
    expect(result![0].images).toHaveLength(0);
  });

  it('should handle posts with multiple images', async () => {
    const query = new GetLatestPostsQuery({ limit: 1 });
    const fileId1 = 'file-1';
    const fileId2 = 'file-2';
    const fileId3 = 'file-3';
    const post = makePost({
      id: 'post-1',
      description: 'Multi-image post',
      images: [
        makePostImage({ fileId: fileId1, order: 0 }),
        makePostImage({ fileId: fileId2, order: 1 }),
        makePostImage({ fileId: fileId3, order: 2 }),
      ],
    });

    postQueryRepositoryMock.getLatestPosts.mockResolvedValue([post]);
    grpcAdapterMock.getFilesByIds.mockResolvedValue({
      files: {
        [fileId1]: { fileId: fileId1, fileUrl: 'https://cdn.com/img1.jpg' },
        [fileId2]: { fileId: fileId2, fileUrl: 'https://cdn.com/img2.jpg' },
        [fileId3]: { fileId: fileId3, fileUrl: 'https://cdn.com/img3.jpg' },
      },
    } as any);

    const postQueryRepositorySpy = jest.spyOn(postQueryRepositoryMock, 'getLatestPosts');
    const grpcAdapterSpy = jest.spyOn(grpcAdapterMock, 'getFilesByIds');

    const result = await handler.execute(query);

    expect(result).toHaveLength(1);
    expect(postQueryRepositorySpy).toHaveBeenCalledWith(1);
    expect(grpcAdapterSpy).toHaveBeenCalledWith({
      fileIds: [fileId1, fileId2, fileId3],
    });
    expect(result![0].images).toHaveLength(3);
    expect(result![0].images[0].url).toBe('https://cdn.com/img1.jpg');
    expect(result![0].images[2].url).toBe('https://cdn.com/img3.jpg');
  });

  it('should filter out images not found in files response', async () => {
    const query = new GetLatestPostsQuery({ limit: 1 });
    const existingFileId = 'file-existing';
    const missingFileId = 'file-missing';
    const post = makePost({
      id: 'post-1',
      description: 'Post with missing files',
      images: [
        makePostImage({ fileId: existingFileId, order: 0 }),
        makePostImage({ fileId: missingFileId, order: 1 }),
      ],
    });

    postQueryRepositoryMock.getLatestPosts.mockResolvedValue([post]);
    grpcAdapterMock.getFilesByIds.mockResolvedValue({
      files: {
        [existingFileId]: { fileId: existingFileId, fileUrl: 'https://cdn.com/existing.jpg' },
      },
    } as any);

    const postQueryRepositorySpy = jest.spyOn(postQueryRepositoryMock, 'getLatestPosts');
    const grpcAdapterSpy = jest.spyOn(grpcAdapterMock, 'getFilesByIds');

    const result = await handler.execute(query);

    expect(result).toHaveLength(1);
    expect(postQueryRepositorySpy).toHaveBeenCalledWith(1);
    expect(grpcAdapterSpy).toHaveBeenCalledWith({
      fileIds: [existingFileId, missingFileId],
    });
    expect(result![0].images).toHaveLength(1);
    expect(result![0].images[0].fileId).toBe(existingFileId);
  });

  it('should propagate DomainException from repository', async () => {
    const query = new GetLatestPostsQuery({ limit: 1 });
    const error = new DomainException({
      code: DomainExceptionCode.InternalServerError,
      message: 'Database connection failed',
    });
    postQueryRepositoryMock.getLatestPosts.mockRejectedValue(error);

    const postQueryRepositorySpy = jest.spyOn(postQueryRepositoryMock, 'getLatestPosts');
    const grpcAdapterSpy = jest.spyOn(grpcAdapterMock, 'getFilesByIds');
    await expect(handler.execute(query)).rejects.toThrow('Database connection failed');
    expect(postQueryRepositorySpy).toHaveBeenCalledWith(1);
    expect(grpcAdapterSpy).not.toHaveBeenCalled();
  });

  it('should propagate DomainException from grpc adapter', async () => {
    const query = new GetLatestPostsQuery({ limit: 1 });
    const fileId = 'file-1';
    const post = makePost({
      id: 'post-1',
      description: 'Desc 1',
      images: [makePostImage({ fileId, order: 0 })],
    });

    postQueryRepositoryMock.getLatestPosts.mockResolvedValue([post]);
    const error = new DomainException({
      code: DomainExceptionCode.ServiceUnavailable,
      message: 'File service unavailable',
    });
    grpcAdapterMock.getFilesByIds.mockRejectedValue(error);

    const postQueryRepositorySpy = jest.spyOn(postQueryRepositoryMock, 'getLatestPosts');
    const grpcAdapterSpy = jest.spyOn(grpcAdapterMock, 'getFilesByIds');

    await expect(handler.execute(query)).rejects.toThrow('File service unavailable');
    expect(postQueryRepositorySpy).toHaveBeenCalledWith(1);
    expect(grpcAdapterSpy).toHaveBeenCalledWith({ fileIds: [fileId] });
  });
});
