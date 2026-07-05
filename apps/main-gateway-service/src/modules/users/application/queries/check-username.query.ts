import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { IProfileRepository } from '../../domain/interfaces/user-profile.repository.interface';
import { ProfileEntity } from '../../domain/profile.entity';

export class CheckUsernameQuery {
  constructor(public readonly username: string) {}
}

@QueryHandler(CheckUsernameQuery)
export class CheckUsernameHandler implements IQueryHandler<
  CheckUsernameQuery,
  { available: boolean }
> {
  constructor(private readonly profileRepository: IProfileRepository) {}

  async execute({ username }: CheckUsernameQuery): Promise<{ available: boolean }> {
    const user: ProfileEntity | null = await this.profileRepository.findByUsername(username);

    return { available: !user };
  }
}
