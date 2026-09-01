import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { DomainException, DomainExceptionCode } from '../../../../../../../libs/common/src';
import {
  IUsersQueryRepository,
  UserViewType,
} from '../../domain/interfaces/users.query-repository.interface';
import {
  IProfileQueryRepository,
  ProfileViewType,
} from '../../domain/interfaces/user-profile.query-repository.interface';
import { UserGrpcDto } from '../../api/grpc/dto/user-grpc.dto';

export class GetNotificationRecipientContextQuery {
  constructor(public readonly userId: string) {}
}

@QueryHandler(GetNotificationRecipientContextQuery)
export class GetNotificationRecipientContextHandler implements IQueryHandler<
  GetNotificationRecipientContextQuery,
  UserGrpcDto
> {
  constructor(
    private readonly usersQueryRepository: IUsersQueryRepository,
    private readonly profileQueryRepository: IProfileQueryRepository,
  ) {}

  async execute(query: GetNotificationRecipientContextQuery): Promise<UserGrpcDto> {
    const user: UserViewType | null = await this.usersQueryRepository.getUserById(query.userId);
    const profile: ProfileViewType | null = await this.profileQueryRepository.getProfileByUserId(
      query.userId,
    );

    if (!user || !profile) {
      throw new DomainException({
        code: DomainExceptionCode.NotFound,
        message: 'User was not found',
      });
    }

    return { id: user.id, email: user.email, username: profile.username };
  }
}
