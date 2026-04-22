import { UserEntity } from '../user.entity';

export abstract class IUsersRepository {
  abstract save(user: UserEntity): Promise<UserEntity>;

  abstract findById(id: string): Promise<UserEntity | null>;

  abstract findByEmail(email: string): Promise<UserEntity | null>;

  abstract findByUsernameOrEmail(usernameOrEmail: string): Promise<UserEntity | null>;

  abstract update(user: UserEntity): Promise<UserEntity>;
}
