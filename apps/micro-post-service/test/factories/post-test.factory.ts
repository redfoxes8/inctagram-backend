import { randomUUID } from 'crypto';
import { PostEntity, PostProps } from '../../src/modules/posts/domain/post.entity';
import { PostImageEntity, PostImageProps } from '../../src/modules/posts/domain/post-image.entity';
import { PostViewType, FileDataViewType } from '../../src/modules/posts/domain/post.types';

export function makeOwnerId(): string {
  return randomUUID();
}

export function makeFileId(): string {
  return randomUUID();
}

export function makePostImageProps(overrides: Partial<PostImageProps> = {}): PostImageProps {
  return {
    id: overrides.id || randomUUID(),
    postId: overrides.postId || randomUUID(),
    fileId: overrides.fileId || randomUUID(),
    order: overrides.order ?? 0,
  };
}

export function makePostImage(overrides: Partial<PostImageProps> = {}): PostImageEntity {
  const props = makePostImageProps(overrides);
  return new PostImageEntity(props);
}

export function makePostProps(overrides: Partial<PostProps> = {}): PostProps {
  const defaultPostId = randomUUID();
  const defaultImages = [
    makePostImage({ postId: defaultPostId, order: 0 })
  ];

  return {
    id: overrides.id || defaultPostId,
    ownerId: overrides.ownerId || randomUUID(),
    description: overrides.description ?? 'Default description',
    images: overrides.images ?? defaultImages,
    createdAt: overrides.createdAt || new Date(),
    updatedAt: overrides.updatedAt || new Date(),
    deletedAt: overrides.deletedAt ?? null,
  };
}

export function makePost(overrides: Partial<PostProps> = {}): PostEntity {
  const props = makePostProps(overrides);
  const entity = new PostEntity(props);
  // If overrides explicitly defined an ID, ensure it is set correctly on the entity (BaseDomainEntity has id setter/getter)
  if (props.id) {
    entity.id = props.id;
  }
  return entity;
}

export function makePostView(overrides: Partial<PostViewType> = {}): PostViewType {
  const postId = overrides.id || randomUUID();
  const defaultImages: FileDataViewType[] = [
    {
      id: randomUUID(),
      fileId: randomUUID(),
      url: 'https://example.com/image.jpg',
      order: 0,
    },
  ];

  return {
    id: postId,
    ownerId: overrides.ownerId || randomUUID(),
    description: overrides.description || 'View description',
    images: overrides.images || defaultImages,
    createdAt: overrides.createdAt || new Date(),
    updatedAt: overrides.updatedAt || new Date(),
  };
}

export function makePostRecordSeed(overrides: any = {}): any {
  const postId = overrides.id || randomUUID();
  return {
    id: postId,
    ownerId: overrides.ownerId || randomUUID(),
    description: overrides.description || 'Seed description',
    createdAt: overrides.createdAt || new Date(),
    updatedAt: overrides.updatedAt || new Date(),
    deletedAt: overrides.deletedAt || null,
    images: overrides.images || {
      create: [
        {
          id: randomUUID(),
          fileId: randomUUID(),
          order: 0,
        },
      ],
    },
  };
}
