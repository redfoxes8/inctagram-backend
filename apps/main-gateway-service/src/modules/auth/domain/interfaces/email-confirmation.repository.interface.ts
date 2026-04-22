import { EmailConfirmationEntity } from '../email-confirmation.entity';

export abstract class IEmailConfirmationRepository {
  abstract save(confirmation: EmailConfirmationEntity): Promise<void>;

  abstract findByUserId(userId: string): Promise<EmailConfirmationEntity | null>;

  abstract deleteByUserId(userId: string): Promise<void>;

  abstract update(confirmation: EmailConfirmationEntity): Promise<void>;
}
