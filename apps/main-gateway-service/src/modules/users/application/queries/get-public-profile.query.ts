import { Logger } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { PostGrpcClient } from '../../../posts/infrastructure/post-grpc.client';
import { IUserProfileQueryRepository } from '../../domain/interfaces/user-profile.query-repository.interface';
import { IUsersQueryRepository } from '../../domain/interfaces/users.query-repository.interface';
import { PublicProfileResponseDto } from '../../api/dto/public-profile-response.dto';
import { PublicProfileMapper } from '../../api/mappers/public-profile.mapper';

export class GetPublicProfileQuery {
  constructor(public readonly userId: string) {}
}

const logger = new Logger('GetPublicProfileQueryHandler');

@QueryHandler(GetPublicProfileQuery)
export class GetPublicProfileHandler implements IQueryHandler<GetPublicProfileQuery, PublicProfileResponseDto> {
  constructor(
    private readonly usersQueryRepository: IUsersQueryRepository,
    private readonly userProfileQueryRepository: IUserProfileQueryRepository,
    private readonly postGrpcClient: PostGrpcClient,
  ) {}

  async execute(query: GetPublicProfileQuery): Promise<PublicProfileResponseDto> {
    const { userId } = query;
    const startTime = Date.now();

    logger.debug(`Handler started: userId=${userId}`);

    const [user, profile, postsCountRes] = await Promise.all([
      this.usersQueryRepository.getUserById(userId),
      this.userProfileQueryRepository.getPublicProfile(userId),
      this.postGrpcClient.getPostsCountByUserId({ ownerId: userId }),
    ]);

    logger.debug(`User loaded: exists=${!!user}`);
    logger.debug(`Profile loaded: exists=${!!profile}`);
    logger.debug(`postsCount received: count=${postsCountRes.count}`);
    logger.debug('Aggregation completed');

    if (!user) {
      throw new DomainException({
        code: DomainExceptionCode.NotFound,
        message: 'User not found',
      });
    }

    const elapsed = Date.now() - startTime;
    logger.debug(`Handler completed: elapsed=${elapsed}ms`);

    return PublicProfileMapper.toPublicProfileResponse(user, profile, postsCountRes.count);
  }
}
