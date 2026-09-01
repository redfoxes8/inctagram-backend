import { Logger } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import {
  IProfileQueryRepository,
  ProfileViewType,
} from '../../domain/interfaces/user-profile.query-repository.interface';
import { ProfileHttpMapper } from '../../api/rest/mappers/profile.http.mapper';
import { GetProfileResponseDto } from '../../api/rest/dto/get-profile.dto';
import { IPostGrpcAdapter } from '../../../posts/infrastructure/interfaces/post-grpc-adapter.interface';
import {
  IUsersQueryRepository,
  UserViewType,
} from '../../domain/interfaces/users.query-repository.interface';

export class GetProfileQuery {
  constructor(public readonly userId: string) {}
}

@QueryHandler(GetProfileQuery)
export class GetProfileHandler implements IQueryHandler<GetProfileQuery, GetProfileResponseDto> {
  private readonly logger = new Logger(GetProfileHandler.name);
  constructor(
    private readonly userProfileQueryRepository: IProfileQueryRepository,
    private readonly postGrpcAdapter: IPostGrpcAdapter,
    private readonly usersQueryRepository: IUsersQueryRepository,
  ) {}

  async execute(query: GetProfileQuery): Promise<GetProfileResponseDto> {
    const startTime = Date.now();

    this.logger.debug(`Handler started: userId=${query.userId}`);

    const profile: ProfileViewType | null =
      await this.userProfileQueryRepository.getProfileByUserId(query.userId);

    if (!profile) {
      throw new DomainException({
        code: DomainExceptionCode.NotFound,
        message: 'Profile not found',
      });
    }
    this.logger.debug(`Profile loaded: exists=${!!profile}`);

    const user: UserViewType | null = await this.usersQueryRepository.getUserById(query.userId);

    if (!user) {
      throw new DomainException({
        code: DomainExceptionCode.NotFound,
        message: 'User not found',
      });
    }

    const postsCount: number = await this.postGrpcAdapter.getPostsCount(query.userId);
    this.logger.debug(`postsCount received: count=${postsCount}`);

    this.logger.debug('Aggregation completed');
    const elapsed = Date.now() - startTime;
    this.logger.debug(`Handler completed: elapsed=${elapsed}ms`);

    return ProfileHttpMapper.toGetProfile(profile, user.accountType, postsCount);
  }
}
