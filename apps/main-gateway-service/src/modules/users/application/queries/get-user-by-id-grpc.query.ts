import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';

import {
  IUsersQueryRepository,
  UserViewType,
} from '../../domain/interfaces/users.query-repository.interface';

import {
  IProfileQueryRepository,
  ProfileViewType,
} from '../../domain/interfaces/user-profile.query-repository.interface';
import { UserGrpcDto } from '../../api/grpc/dto/user-grpc.dto';

export class GetUserByIdGrpcQuery {
  constructor(public readonly userId: string) {}
}

@QueryHandler(GetUserByIdGrpcQuery)
export class GetUserByIdGrpcHandler implements IQueryHandler<GetUserByIdGrpcQuery, UserGrpcDto> {
  constructor(
    private readonly usersQueryRepository: IUsersQueryRepository,
    private readonly profileQueryRepository: IProfileQueryRepository,
  ) {}

  async execute(query: GetUserByIdGrpcQuery): Promise<UserGrpcDto> {
    const user: UserViewType | null = await this.usersQueryRepository.getUserById(query.userId);

    if (!user) {
      throw new DomainException({
        code: DomainExceptionCode.NotFound,
        message: 'User was not found',
      });
    }

    const profile: ProfileViewType | null = await this.profileQueryRepository.getProfileByUserId(
      query.userId,
    );

    if (!profile) {
      throw new DomainException({
        code: DomainExceptionCode.NotFound,
        message: 'Profile was not found',
      });
    }

    return {
      id: user.id,
      email: user.email,
      username: profile.username,
    };
  }
}
