import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { UserMeResponseDto } from '../../api/dto/user-me-response.dto';
import { UserMeResponseMapper } from '../../api/mappers/user-to-me-response.mapper';
import { IUsersQueryRepository } from '../../domain/interfaces/users.query-repository.interface';

export class GetMeQuery {
  constructor(public readonly userId: string) {}
}

@QueryHandler(GetMeQuery)
export class GetMeHandler implements IQueryHandler<GetMeQuery, UserMeResponseDto> {
  constructor(private readonly usersQueryRepository: IUsersQueryRepository) {}

  public async execute(query: GetMeQuery): Promise<UserMeResponseDto> {
    const profile = await this.usersQueryRepository.getProfileById(query.userId);

    if (!profile) {
      throw new DomainException({
        code: DomainExceptionCode.NotFound,
        message: 'User was not found',
      });
    }

    return UserMeResponseMapper.fromProfile(profile);
  }
}
