import { makePost, makePostImage } from '../factories/post-test.factory';
import { PostEntity } from '../../src/modules/posts/domain/post.entity';

describe('PostEntity (Domain Unit)', () => {
  it('should successfully create a post entity with correct parameters', () => {
    // Arrange
    const description = 'Test description';
    const images = [makePostImage({ order: 0 })];

    // Act
    const post = PostEntity.create({
      ownerId: 'owner-id',
      description,
    });
    post.setImages(images);

    // Assert
    expect(post.ownerId).toBe('owner-id');
    expect(post.description).toBe(description);
    expect(post.images).toEqual(images);
    expect(post.id).toBeDefined();
    expect(post.createdAt).toBeInstanceOf(Date);
  });

  it('should throw an error when updating description to more than 500 characters', () => {
    // Arrange
    const post = makePost();
    const longDescription = 'a'.repeat(501);

    // Act & Assert
    expect(() => {
      post.updateDescription(longDescription);
    }).toThrow('Description too long');
  });

  it('should update description successfully and touch updatedAt when valid length is provided', () => {
    // Arrange
    const post = makePost({ description: 'Old Description' });
    const originalUpdatedAt = post.updatedAt;
    const newDescription = 'New Valid Description';

    // Act
    post.updateDescription(newDescription);

    // Assert
    expect(post.description).toBe(newDescription);
    expect(post.updatedAt.getTime()).toBeGreaterThanOrEqual(originalUpdatedAt.getTime());
  });

  it('should throw an error when setting less than 1 or more than 10 images', () => {
    // Arrange
    const post = makePost();

    // Act & Assert
    expect(() => {
      post.setImages([]);
    }).toThrow('Images count must be between 1 and 10');

    const tooManyImages = Array.from({ length: 11 }, (_, i) => makePostImage({ order: i }));
    expect(() => {
      post.setImages(tooManyImages);
    }).toThrow('Images count must be between 1 and 10');
  });

  it('should successfully set between 1 and 10 images', () => {
    // Arrange
    const post = makePost();
    const validImages = Array.from({ length: 5 }, (_, i) => makePostImage({ order: i }));

    // Act
    post.setImages(validImages);

    // Assert
    expect(post.images).toHaveLength(5);
    expect(post.images).toEqual(validImages);
  });
});
