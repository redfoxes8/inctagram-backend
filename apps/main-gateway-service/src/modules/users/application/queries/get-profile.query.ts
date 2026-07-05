import { Logger } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import {
  IProfileQueryRepository,
  ProfileViewType,
} from '../../domain/interfaces/user-profile.query-repository.interface';
import { ProfileHttpMapper } from '../../api/mappers/profile.http.mapper';
import { GetProfileRequestDto, GetProfileResponseDto } from '../../api/dto/get-profile.dto';
import { IPostGrpcAdapter } from '../../../posts/infrastructure/interfaces/post-grpc-adapter.interface';

export class GetProfileQuery {
  constructor(public readonly dto: GetProfileRequestDto) {}
}

@QueryHandler(GetProfileQuery)
export class GetProfileHandler implements IQueryHandler<GetProfileQuery, GetProfileResponseDto> {
  private readonly logger = new Logger(GetProfileHandler.name);
  constructor(
    private readonly userProfileQueryRepository: IProfileQueryRepository,
    private readonly postGrpcAdapter: IPostGrpcAdapter,
  ) {}

  async execute({ dto }: GetProfileQuery): Promise<GetProfileResponseDto> {
    const startTime = Date.now();

    this.logger.debug(`Handler started: userId=${dto.userId}`);

    const profile: ProfileViewType | null =
      await this.userProfileQueryRepository.getProfileByUserId(dto.userId);
    if (!profile) {
      throw new DomainException({
        code: DomainExceptionCode.NotFound,
        message: 'Profile not found',
      });
    }
    this.logger.debug(`Profile loaded: exists=${!!profile}`);

    const postsCount: number = await this.postGrpcAdapter.getPostsCount(dto);
    this.logger.debug(`postsCount received: count=${postsCount}`);

    this.logger.debug('Aggregation completed');
    const elapsed = Date.now() - startTime;
    this.logger.debug(`Handler completed: elapsed=${elapsed}ms`);

    return ProfileHttpMapper.toGetProfile(profile, postsCount);
  }
}
