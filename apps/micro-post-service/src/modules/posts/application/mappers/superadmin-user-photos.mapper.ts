import { Injectable } from '@nestjs/common';
import { SuperadminPostsUnavailableException } from '../../../../../../../libs/common/src/exceptions/superadmin-posts-unavailable.exception';
import { SuperadminPostFiles } from '../ports/superadmin-posts-read.port';
import type {
  SuperadminUserPhoto,
  SuperadminUserPhotoRecord,
} from '../ports/superadmin-user-photos.port';

@Injectable()
export class SuperadminUserPhotosMapper {
  constructor(private readonly files: SuperadminPostFiles) {}

  async map(items: SuperadminUserPhotoRecord[]): Promise<SuperadminUserPhoto[]> {
    if (items.length > 50) throw new SuperadminPostsUnavailableException('INVALID_READ_MODEL');
    const fileIds = [...new Set(items.map((item) => item.fileId))];
    const urls = fileIds.length
      ? await this.files.findPhotoUrls(fileIds)
      : new Map<string, string>();
    return items.map((item) => ({
      imageId: item.imageId,
      postId: item.postId,
      url: urls.get(item.fileId) ?? null,
    }));
  }
}
