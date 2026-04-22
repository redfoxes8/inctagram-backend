import { Injectable } from '@nestjs/common';
import { EmailConfirmationEntity } from '../domain/email-confirmation.entity';
import { IEmailConfirmationRepository } from '../domain/interfaces/email-confirmation.repository.interface';

@Injectable()
export class EmailConfirmationRepositoryImplementation implements IEmailConfirmationRepository {
  public async save(confirmation: EmailConfirmationEntity): Promise<void> {
    void confirmation;
    throw new Error('EmailConfirmationRepositoryImplementation is not implemented yet');
  }

  public async findByUserId(userId: string): Promise<EmailConfirmationEntity | null> {
    void userId;
    throw new Error('EmailConfirmationRepositoryImplementation is not implemented yet');
  }

  public async deleteByUserId(userId: string): Promise<void> {
    void userId;
    throw new Error('EmailConfirmationRepositoryImplementation is not implemented yet');
  }

  public async update(confirmation: EmailConfirmationEntity): Promise<void> {
    void confirmation;
    throw new Error('EmailConfirmationRepositoryImplementation is not implemented yet');
  }
}
