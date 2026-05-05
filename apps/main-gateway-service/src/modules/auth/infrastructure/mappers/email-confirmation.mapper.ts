import { EmailConfirmationEntity } from '../../domain/email-confirmation.entity';

type EmailConfirmationRecord = {
  id: string;
  userId: string;
  confirmationCode: string;
  expirationDate: Date;
  isConfirmed: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export class EmailConfirmationMapper {
  public static toDomain(model: EmailConfirmationRecord): EmailConfirmationEntity {
    return new EmailConfirmationEntity({
      id: model.id,
      userId: model.userId,
      confirmationCode: model.confirmationCode,
      expirationDate: model.expirationDate,
      isConfirmed: model.isConfirmed,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
      deletedAt: model.deletedAt,
    });
  }
}
