import { Injectable } from '@nestjs/common';
import { SuperadminPostsPageReader } from '../domain/superadmin-posts-page-reader.port';
import type {
  SuperadminPostsInput,
  SuperadminPostsPage,
} from '../../../../../../libs/common/types/superadmin-posts';
import { normalizeSuperadminPostsInput } from '../../../../../../libs/common/src/validation/normalize-superadmin-posts-input';
@Injectable()
export class GetSuperadminPostsQuery {
  constructor(private readonly reader: SuperadminPostsPageReader) {}
  execute(input: SuperadminPostsInput): Promise<SuperadminPostsPage> {
    return this.reader.findPage(normalizeSuperadminPostsInput(input));
  }
}
