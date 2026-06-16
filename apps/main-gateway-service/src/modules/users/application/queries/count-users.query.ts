import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { IUsersQueryRepository } from '../../domain/interfaces/users.query-repository.interface';

export class CountUsersQuery {
  constructor() {}
}

@QueryHandler(CountUsersQuery)
export class CountUsersHandler implements IQueryHandler<CountUsersQuery, { totalCount: number }> {
  constructor(private usersQueryRepository: IUsersQueryRepository) {}
  async execute(): Promise<{ totalCount: number }> {
    const totalCount: number = await this.usersQueryRepository.countActiveUsers();
    return { totalCount: totalCount };
  }
}
