import { EmailConfirmationEntity } from '../email-confirmation.entity';
import { Prisma } from '@prisma/client/extension';
import TransactionClient = Prisma.TransactionClient;

export abstract class IEmailConfirmationRepository {
  abstract save(confirmation: EmailConfirmationEntity, tx?: TransactionClient): Promise<void>;

  abstract findByUserId(userId: string): Promise<EmailConfirmationEntity | null>;

  abstract deleteByUserId(userId: string): Promise<void>;

  abstract update(confirmation: EmailConfirmationEntity): Promise<void>;

  abstract findByCode(code: string): Promise<EmailConfirmationEntity | null>;
}
