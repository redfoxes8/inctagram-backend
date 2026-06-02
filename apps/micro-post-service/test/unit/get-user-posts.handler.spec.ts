import { of } from 'rxjs';
import { randomUUID } from 'crypto';
import { GetUserPostsHandler } from '../../src/modules/posts/application/queries/get-user-posts.handler';
import { GetUserPostsQuery } from '../../src/modules/posts/application/queries/get-user-posts.query';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { CursorUtil } from '../../src/modules/posts/application/utils/cursor.util';

describe('GetUserPostsHandler (Unit)', () => {
  let handler: GetUserPostsHandler;
  let prismaMock: any;
  let fileServiceClientMock: any;
  let fileServiceMock: any;

  beforeEach(async () => {
    // Arrange: Create mocks
    prismaMock = {
      post: {
        findMany: jest.fn(),
      },
    };

    fileServiceMock = {
      getFilesData: jest.fn(),
    };

    fileServiceClientMock = {
      getService: jest.fn().mockReturnValue(fileServiceMock),
    };

    handler = new GetUserPostsHandler(fileServiceClientMock, prismaMock);
    handler.onModuleInit();
  });

  it('should return paginated posts without cursor (first page)', async () => {
    // Arrange
    const ownerId = randomUUID();
    const query = new GetUserPostsQuery(ownerId, 2);

    const dbPost1 = {
      id: 'post-1',
      ownerId,
      description: 'Post 1',
      createdAt: new Date('2026-05-29T10:00:00.000Z'),
      updatedAt: new Date('2026-05-29T10:00:00.000Z'),
      images: [{ id: 'img-1', fileId: 'file-1', order: 0 }],
    };
    const dbPost2 = {
      id: 'post-2',
      ownerId,
      description: 'Post 2',
      createdAt: new Date('2026-05-29T09:00:00.000Z'),
      updatedAt: new Date('2026-05-29T09:00:00.000Z'),
      images: [{ id: 'img-2', fileId: 'file-2', order: 0 }],
    };

    prismaMock.post.findMany.mockResolvedValue([dbPost1, dbPost2]);
    fileServiceMock.getFilesData.mockReturnValue(
      of({
        files: {
          'file-1': { fileUrl: 'https://cdn.com/1.jpg' },
          'file-2': { fileUrl: 'https://cdn.com/2.jpg' },
        },
      }),
    );

    // Act
    const result = await handler.execute(query);

    // Assert
    expect(result).toBeDefined();
    expect(result.posts).toHaveLength(2);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
    expect(prismaMock.post.findMany).toHaveBeenCalledWith({
      where: { ownerId },
      take: 3,
      cursor: undefined,
      skip: 0,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { images: { orderBy: { order: 'asc' } } },
    });
    expect(fileServiceMock.getFilesData).toHaveBeenCalledWith({ fileIds: ['file-1', 'file-2'] });
    expect(result.posts[0].images[0].url).toBe('https://cdn.com/1.jpg');
  });

  it('should return nextCursor and hasMore when additional posts exist', async () => {
    // Arrange
    const ownerId = randomUUID();
    const query = new GetUserPostsQuery(ownerId, 1);

    const dbPost1 = {
      id: 'post-1',
      ownerId,
      description: 'Post 1',
      createdAt: new Date('2026-05-29T10:00:00.000Z'),
      updatedAt: new Date('2026-05-29T10:00:00.000Z'),
      images: [{ id: 'img-1', fileId: 'file-1', order: 0 }],
    };
    const dbPost2 = {
      id: 'post-2',
      ownerId,
      description: 'Post 2',
      createdAt: new Date('2026-05-29T09:00:00.000Z'),
      updatedAt: new Date('2026-05-29T09:00:00.000Z'),
      images: [{ id: 'img-2', fileId: 'file-2', order: 0 }],
    };

    prismaMock.post.findMany.mockResolvedValue([dbPost1, dbPost2]);
    fileServiceMock.getFilesData.mockReturnValue(
      of({
        files: {
          'file-1': { fileUrl: 'https://cdn.com/1.jpg' },
        },
      }),
    );

    // Act
    const result = await handler.execute(query);

    // Assert
    expect(result.posts).toHaveLength(1);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe(CursorUtil.encode('post-1', dbPost1.createdAt));
  });

  it('should apply cursor query constraints correctly', async () => {
    // Arrange
    const ownerId = randomUUID();
    const date = new Date('2026-05-29T10:00:00.000Z');
    const cursor = CursorUtil.encode('post-1', date);
    const query = new GetUserPostsQuery(ownerId, 2, cursor);

    prismaMock.post.findMany.mockResolvedValue([]);

    // Act
    await handler.execute(query);

    // Assert
    expect(prismaMock.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { id: 'post-1' },
        skip: 1,
      }),
    );
  });
});
