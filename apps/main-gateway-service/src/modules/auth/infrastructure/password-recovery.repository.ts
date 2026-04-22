import { Injectable } from '@nestjs/common';
import { PasswordRecoveryEntity } from '../domain/password-recovery.entity';
import { IPasswordRecoveryRepository } from '../domain/interfaces/password-recovery.repository.interface';

@Injectable()
export class PasswordRecoveryRepositoryImplementation implements IPasswordRecoveryRepository {
  public async save(recovery: PasswordRecoveryEntity): Promise<void> {
    void recovery;
    throw new Error('PasswordRecoveryRepositoryImplementation is not implemented yet');
  }

  public async findByUserIdAndCode(
    userId: string,
    recoveryCode: string,
  ): Promise<PasswordRecoveryEntity | null> {
    void userId;
    void recoveryCode;
    throw new Error('PasswordRecoveryRepositoryImplementation is not implemented yet');
  }

  public async deleteByUserId(userId: string): Promise<void> {
    void userId;
    throw new Error('PasswordRecoveryRepositoryImplementation is not implemented yet');
  }

  public async update(recovery: PasswordRecoveryEntity): Promise<void> {
    void recovery;
    throw new Error('PasswordRecoveryRepositoryImplementation is not implemented yet');
  }
}
