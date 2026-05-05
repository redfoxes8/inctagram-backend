import { MailTemplates } from '../../core/notification.constants';

export type MailTemplateContext = Record<string, unknown>;

export type SendEmailParams = {
  to: string;
  subject: string;
  template: MailTemplates;
  context: MailTemplateContext;
};

export abstract class IMailAdapter {
  abstract sendEmail(params: SendEmailParams): Promise<void>;
}
