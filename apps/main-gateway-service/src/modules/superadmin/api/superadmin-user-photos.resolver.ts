import { Args, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { PaginationInput } from '../../../../../../libs/common/src/graphql/pagination-input';
import type { SuperadminUser } from '../../../../../../libs/common/types/superadmin-users';
import {
  SuperadminUserPhotosReader,
  type SuperadminUserPhotosPage,
} from '../domain/superadmin-user-photos.port';

@Resolver('SuperadminUser')
export class SuperadminUserPhotosResolver {
  constructor(private readonly photos: SuperadminUserPhotosReader) {}
  @ResolveField('uploadedPhotos')
  list(
    @Parent() user: SuperadminUser,
    @Args('input') input: PaginationInput,
  ): Promise<SuperadminUserPhotosPage> {
    return this.photos.findPage({
      userId: user.userId,
      page: input.page,
      pageSize: input.pageSize,
    });
  }
}
