import { Injectable, Logger } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { join } from 'path';
import Handlebars from 'handlebars';
import { createTransport, type SendMailOptions, type Transporter } from 'nodemailer';

import { NotificationConfig } from '../../../core/notification.config';
import {
  IMailAdapter,
  SendEmailParams,
} from '../../../application/interfaces/mail-adapter.interface';
import { MailTemplates } from '../../../core/notification.constants';

@Injectable()
export class NodemailerMailAdapter implements IMailAdapter {
  private readonly logger = new Logger(NodemailerMailAdapter.name);
  private readonly transporter: Transporter;

  constructor(private readonly notificationConfig: NotificationConfig) {
    this.transporter = createTransport({
      host: this.notificationConfig.smtpHost,
      port: this.notificationConfig.smtpPort,
      secure: this.notificationConfig.smtpSecure,
      auth: {
        user: this.notificationConfig.smtpUser,
        pass: this.notificationConfig.smtpPassword,
      },
    });
  }

  public async sendEmail(params: SendEmailParams): Promise<void> {
    try {
      const templateHtml = await this.renderTemplate(params.template, params.context);
      const layoutHtml = await this.renderLayout(templateHtml, params.context);
      const mailOptions: SendMailOptions = {
        from: this.formatFromAddress(),
        to: params.to,
        subject: params.subject,
        html: layoutHtml,
      };

      await this.transporter.sendMail(mailOptions);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to send email to ${params.to}`,
        error instanceof Error ? error.stack : undefined,
      );

      throw error;
    }
  }

  private async renderTemplate(
    templateName: MailTemplates,
    context: Record<string, unknown>,
  ): Promise<string> {
    const templatePath = join(__dirname, 'infrastructure', 'templates', `${templateName}.hbs`);

    const templateSource = await readFile(templatePath, 'utf8');
    const template = Handlebars.compile(templateSource);

    return template(context);
  }

  private async renderLayout(body: string, context: Record<string, unknown>): Promise<string> {
    const layoutPath = join(__dirname, 'infrastructure', 'templates', `${MailTemplates.BaseLayout}.hbs`);
    const layoutSource = await readFile(layoutPath, 'utf8');
    const layoutTemplate = Handlebars.compile(layoutSource);

    return layoutTemplate({
      ...context,
      body,
    });
  }

  private formatFromAddress(): string {
    return `"${this.notificationConfig.smtpFromName}" <${this.notificationConfig.smtpFromEmail}>`;
  }
}
