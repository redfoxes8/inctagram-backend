import { GrpcResponseMapper } from '../../src/modules/posts/api/mappers/grpc-response.mapper';
import { makePostView } from '../factories/post-test.factory';

describe('GrpcResponseMapper (Unit)', () => {
  it('should map PostViewType array to GetLatestPostsResponse correctly', () => {
    // Arrange
    const postViews = [
      makePostView({
        id: 'post-1',
        description: 'First post',
        createdAt: new Date('2026-05-29T10:00:00.000Z'),
        updatedAt: new Date('2026-05-29T10:05:00.000Z'),
      }),
      makePostView({
        id: 'post-2',
        description: 'Second post',
        createdAt: new Date('2026-05-29T11:00:00.000Z'),
        updatedAt: new Date('2026-05-29T11:10:00.000Z'),
      }),
    ];

    // Act
    const response = GrpcResponseMapper.getLatestPostsResponse(postViews);

    // Assert
    expect(response).toBeDefined();
    expect(response.posts).toHaveLength(2);

    const firstMapped = response.posts[0];
    expect(firstMapped.id).toBe('post-1');
    expect(firstMapped.description).toBe('First post');
    expect(firstMapped.createdAt).toEqual({
      seconds: Math.floor(new Date('2026-05-29T10:00:00.000Z').getTime() / 1000),
      nanos: 0,
    });
    expect(firstMapped.updatedAt).toEqual({
      seconds: Math.floor(new Date('2026-05-29T10:05:00.000Z').getTime() / 1000),
      nanos: 0,
    });

    const secondMapped = response.posts[1];
    expect(secondMapped.id).toBe('post-2');
    expect(secondMapped.description).toBe('Second post');
  });

  it('should handle an empty list of posts gracefully', () => {
    // Arrange
    const postViews: any[] = [];

    // Act
    const response = GrpcResponseMapper.getLatestPostsResponse(postViews);

    // Assert
    expect(response).toBeDefined();
    expect(response.posts).toEqual([]);
  });
});
