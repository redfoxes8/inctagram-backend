import { PasswordRecoveryEntity } from '../../domain/password-recovery.entity';

type PasswordRecoveryRecord = {
  id: string;
  userId: string;
  recoveryCode: string;
  expirationDate: Date;
  isUsed: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export class PasswordRecoveryMapper {
  public static toDomain(model: PasswordRecoveryRecord): PasswordRecoveryEntity {
    return new PasswordRecoveryEntity({
      id: model.id,
      userId: model.userId,
      recoveryCode: model.recoveryCode,
      expirationDate: model.expirationDate,
      isUsed: model.isUsed,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
      deletedAt: model.deletedAt,
    });
  }
}
