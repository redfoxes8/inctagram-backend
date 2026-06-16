import { PostMapper } from '../../src/modules/posts/infrastructure/mappers/post.mapper';
import { makePost } from '../factories/post-test.factory';

describe('PostMapper', () => {
  it('should skip broken file references without throwing', () => {
    const post = makePost({
      id: 'post-1',
      description: 'Desc 1',
      images: [
        {
          id: 'img-1',
          postId: 'post-1',
          fileId: 'file-existing',
          order: 0,
        },
        {
          id: 'img-2',
          postId: 'post-1',
          fileId: 'file-missing',
          order: 1,
        },
      ] as any,
    });

    const result = PostMapper.toView([post], {
      files: {
        'file-existing': {
          fileId: 'file-existing',
          fileUrl: 'https://cdn.example/file-existing.jpg',
        },
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0].images).toHaveLength(1);
    expect(result[0].images[0]).toEqual({
      id: 'img-1',
      fileId: 'file-existing',
      url: 'https://cdn.example/file-existing.jpg',
      order: 0,
    });
  });
});
