import { Injectable } from '@nestjs/common';
import { SuperadminPostPublishedReader } from '../domain/superadmin-post-published-reader.port';
import { SuperadminPostsUnavailableException } from '../../../../../../libs/common/src/exceptions/superadmin-posts-unavailable.exception';
import type { SuperadminPostPublishedView } from '../../../../../../libs/common/types/superadmin-posts';

@Injectable()
export class UnavailablePostPublishedReader extends SuperadminPostPublishedReader {
  checkProjectionReady(): Promise<void> {
    return Promise.reject(new SuperadminPostsUnavailableException('NOT_READY'));
  }
  readPublishedView(): Promise<SuperadminPostPublishedView> {
    return Promise.reject(new SuperadminPostsUnavailableException('NOT_READY'));
  }
}
