import { UserEntity } from '../../domain/user.entity';

export type UserRecord = {
  id: string;
  email: string;
  username: string;
  passwordHash: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  isConfirmed: boolean;
};

export class UserMapper {
  public static toDomain(model: UserRecord): UserEntity {
    return new UserEntity({
      id: model.id,
      username: model.username,
      email: model.email,
      passwordHash: model.passwordHash,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
      deletedAt: model.deletedAt,
      isConfirmed: model.isConfirmed,
    });
  }
}
