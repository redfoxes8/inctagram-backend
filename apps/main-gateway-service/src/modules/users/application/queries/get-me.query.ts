import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { UserMeResponseDto } from '../../api/rest/dto/user-me.dto';
import {
  IUsersQueryRepository,
  UserViewType,
} from '../../domain/interfaces/users.query-repository.interface';
import {
  IProfileQueryRepository,
  ProfileViewType,
} from '../../domain/interfaces/user-profile.query-repository.interface';
import { UserHttpMapper } from '../../api/rest/mappers/user.http.mapper';

export class GetMeQuery {
  constructor(public readonly userId: string) {}
}

@QueryHandler(GetMeQuery)
export class GetMeHandler implements IQueryHandler<GetMeQuery, UserMeResponseDto> {
  constructor(
    private readonly usersQueryRepository: IUsersQueryRepository,
    private readonly userProfileQueryRepository: IProfileQueryRepository,
  ) {}

  public async execute(query: GetMeQuery): Promise<UserMeResponseDto> {
    const user: UserViewType | null = await this.usersQueryRepository.getUserById(query.userId);

    if (!user) {
      throw new DomainException({
        code: DomainExceptionCode.NotFound,
        message: 'User was not found',
      });
    }

    const profile: ProfileViewType | null =
      await this.userProfileQueryRepository.getProfileByUserId(query.userId);
    if (!profile) {
      throw new DomainException({
        code: DomainExceptionCode.NotFound,
        message: 'Profile was not found',
      });
    }
    return UserHttpMapper.toGetMe(user, profile);
  }
}
