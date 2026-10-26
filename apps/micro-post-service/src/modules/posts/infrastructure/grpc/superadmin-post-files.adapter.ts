import { Injectable } from '@nestjs/common';
import { SuperadminPostFiles } from '../../application/ports/superadmin-posts-read.port';
import { SUPERADMIN_POSTS_MAX_FILE_IDS } from '../../../../../../../libs/common/types/superadmin-posts';
import { SuperadminPostsUnavailableException } from '../../../../../../../libs/common/src/exceptions/superadmin-posts-unavailable.exception';
import { FileGrpcClient } from './file-grpc.client';

@Injectable()
export class SuperadminPostFilesAdapter extends SuperadminPostFiles {
  constructor(private readonly client: FileGrpcClient) {
    super();
  }

  async findUrls(fileIds: string[]): Promise<ReadonlyMap<string, string>> {
    const unique = [...new Set(fileIds)];
    if (unique.length > SUPERADMIN_POSTS_MAX_FILE_IDS)
      throw new SuperadminPostsUnavailableException('INVALID_READ_MODEL');
    if (!unique.length) return new Map();
    try {
      const response = await this.client.getFilesByIds({ fileIds: unique });
      // An omitted empty protobuf map is valid; an invalid entry is not a missing File.
      const files = response.files ?? {};
      if (typeof files !== 'object' || Array.isArray(files) || response.files === null)
        throw new Error();
      const urls = new Map<string, string>();
      for (const fileId of unique) {
        if (!Object.hasOwn(files, fileId)) continue;
        const file = files[fileId];
        if (!file || file.fileId !== fileId || typeof file.fileUrl !== 'string') throw new Error();
        const url = new URL(file.fileUrl);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
          throw new Error();
        urls.set(fileId, file.fileUrl);
      }
      return urls;
    } catch {
      throw new SuperadminPostsUnavailableException('FILES');
    }
  }
}
