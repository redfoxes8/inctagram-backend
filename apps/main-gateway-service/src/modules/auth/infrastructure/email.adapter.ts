import { Injectable } from '@nestjs/common';
import { IEmailAdapter } from '../application/interfaces/email.adapter.interface';

@Injectable()
export class EmailAdapterImplementation implements IEmailAdapter {
  public async sendRegistrationCode(email: string, code: string): Promise<void> {
    void email;
    void code;
    throw new Error('EmailAdapterImplementation is not implemented yet');
  }

  public async sendPasswordRecoveryCode(email: string, code: string): Promise<void> {
    void email;
    void code;
    throw new Error('EmailAdapterImplementation is not implemented yet');
  }
}
