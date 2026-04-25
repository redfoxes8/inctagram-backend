import { Injectable } from '@nestjs/common';

import { IMailAdapter, SendEmailParams } from '../../../application/interfaces/mail-adapter.interface';

@Injectable()
export class NotificationsService {
  constructor(private readonly mailAdapter: IMailAdapter) {}

  public async sendEmail(params: SendEmailParams): Promise<void> {
    await this.mailAdapter.sendEmail(params);
  }
}
