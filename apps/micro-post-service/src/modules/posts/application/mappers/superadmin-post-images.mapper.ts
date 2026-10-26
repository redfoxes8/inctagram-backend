import { Injectable } from '@nestjs/common';
import {
  SUPERADMIN_POSTS_MAX_FIRST,
  SUPERADMIN_POSTS_MAX_IMAGES,
  SUPERADMIN_POSTS_MAX_FILE_IDS,
  type SuperadminPostRecord,
  type SuperadminPost,
} from '../../../../../../../libs/common/types/superadmin-posts';
import { SuperadminPostsUnavailableException } from '../../../../../../../libs/common/src/exceptions/superadmin-posts-unavailable.exception';
import { SuperadminPostFiles } from '../ports/superadmin-posts-read.port';

@Injectable()
export class SuperadminPostImagesMapper {
  constructor(private readonly files: SuperadminPostFiles) {}

  async map(posts: SuperadminPostRecord[]): Promise<SuperadminPost[]> {
    if (
      posts.length > SUPERADMIN_POSTS_MAX_FIRST ||
      posts.some((post) => post.images.length > SUPERADMIN_POSTS_MAX_IMAGES)
    )
      throw new SuperadminPostsUnavailableException('INVALID_READ_MODEL');
    const fileIds = [...new Set(posts.flatMap((post) => post.images.map((image) => image.fileId)))];
    if (fileIds.length > SUPERADMIN_POSTS_MAX_FILE_IDS)
      throw new SuperadminPostsUnavailableException('INVALID_READ_MODEL');
    const urls = fileIds.length ? await this.files.findUrls(fileIds) : new Map<string, string>();
    return posts.map((post) => ({
      ...post,
      images: post.images.map((image) => ({ ...image, url: urls.get(image.fileId) ?? null })),
    }));
  }
}
