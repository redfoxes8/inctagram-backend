import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';

import { NotificationsService } from '../application/notifications.service';
import { PasswordRecoveryEmailSentDto } from '../application/dto/password-recovery-email-sent.dto';
import { RegistrationEmailSentDto } from '../application/dto/registration-email-sent.dto';
import {
  NOTIFICATION_MESSAGE_REGISTRY,
  NotificationEvents,
} from '../../../core/notification.constants';
import { NotificationConfig } from '../../../core/notification.config';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';
import {
  SendEmailParams,
  MailTemplateContext,
} from '../../../application/interfaces/mail-adapter.interface';

@Controller()
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);
  private readonly maxRetryAttempts = 3;

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly notificationConfig: NotificationConfig,
  ) {}

  @EventPattern(NotificationEvents.RegistrationEmailSent)
  public async handleRegistrationEmailSent(
    @Payload() dto: RegistrationEmailSentDto,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    try {
      console.log('RegistrationEmailSent ===>', dto);  

      await this.notificationsService.sendEmail(
        this.buildRegistrationEmailParams(dto.email, dto.confirmationCode),
      );
      context.getChannelRef().ack(context.getMessage());
    } catch (error: unknown) {
      this.handleProcessingFailure(
        NotificationEvents.RegistrationEmailSent,
        dto.email,
        context,
        error,
      );
    }
  }

  @EventPattern(NotificationEvents.PasswordRecoveryEmailSent)
  public async handlePasswordRecoveryEmailSent(
    @Payload() dto: PasswordRecoveryEmailSentDto,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    try {
      await this.notificationsService.sendEmail(
        this.buildPasswordRecoveryEmailParams(dto.email, dto.recoveryCode),
      );
      context.getChannelRef().ack(context.getMessage());
    } catch (error: unknown) {
      this.handleProcessingFailure(
        NotificationEvents.PasswordRecoveryEmailSent,
        dto.email,
        context,
        error,
      );
    }
  }

  private handleProcessingFailure(
    eventName: NotificationEvents,
    email: string,
    context: RmqContext,
    error: unknown,
  ): void {
    const message = context.getMessage();

    if (this.isValidationError(error)) {
      this.logger.warn(`Validation failed for ${eventName} message from ${email}`);
      context.getChannelRef().ack(message);
      return;
    }

    const retryCount = this.getRetryCount(message);

    if (retryCount < this.maxRetryAttempts - 1) {
      this.logger.warn(
        `Retrying ${eventName} for ${email}. Attempt ${retryCount + 1} of ${this.maxRetryAttempts}`,
      );

      this.requeueMessage(context, {
        eventName,
        email,
        nextRetryCount: retryCount + 1,
      });
      context.getChannelRef().ack(message);
      return;
    }

    this.logger.error(
      `Critical failure for ${eventName} and ${email}. Moving message to DLQ after ${this.maxRetryAttempts} attempts.`,
      error instanceof Error ? error.stack : undefined,
    );
    this.routeToDeadLetterQueue(context, {
      eventName,
      email,
      reason: 'max_retries_exceeded',
    });
    context.getChannelRef().ack(message);
  }

  private requeueMessage(
    context: RmqContext,
    options: {
      eventName: NotificationEvents;
      email: string;
      nextRetryCount: number;
    },
  ): void {
    const message = context.getMessage();
    const headers = this.getHeaders(message);
    const channel = context.getChannelRef();

    channel.sendToQueue(
      this.notificationConfig.notificationQueueName,
      Buffer.from(message.content),
      {
        persistent: true,
        contentType: message.properties.contentType,
        contentEncoding: message.properties.contentEncoding,
        correlationId: message.properties.correlationId,
        messageId: message.properties.messageId,
        headers: {
          ...headers,
          'x-retry-count': options.nextRetryCount,
          'x-original-event': options.eventName,
          'x-original-email': options.email,
        },
      },
    );
  }

  private routeToDeadLetterQueue(
    context: RmqContext,
    options: {
      eventName: NotificationEvents;
      email: string;
      reason: string;
    },
  ): void {
    const message = context.getMessage();
    const headers = this.getHeaders(message);
    const channel = context.getChannelRef();

    channel.sendToQueue(
      this.notificationConfig.notificationDeadLetterQueueName,
      Buffer.from(message.content),
      {
        persistent: true,
        contentType: message.properties.contentType,
        contentEncoding: message.properties.contentEncoding,
        correlationId: message.properties.correlationId,
        messageId: message.properties.messageId,
        headers: {
          ...headers,
          'x-dlq-reason': options.reason,
          'x-original-event': options.eventName,
          'x-original-email': options.email,
        },
      },
    );
  }

  private getRetryCount(message: ReturnType<RmqContext['getMessage']>): number {
    const headers = this.getHeaders(message);
    const retryCountHeader = headers['x-retry-count'];

    if (typeof retryCountHeader === 'number' && Number.isFinite(retryCountHeader)) {
      return retryCountHeader;
    }

    if (typeof retryCountHeader === 'string') {
      const parsedRetryCount = Number(retryCountHeader);
      if (Number.isFinite(parsedRetryCount)) {
        return parsedRetryCount;
      }
    }

    const xDeath = headers['x-death'];

    if (Array.isArray(xDeath)) {
      const firstDeathEntry = xDeath[0] as Record<string, unknown> | undefined;
      const deathCount = firstDeathEntry?.count;

      if (typeof deathCount === 'number' && Number.isFinite(deathCount)) {
        return deathCount;
      }
    }

    return 0;
  }

  private getHeaders(message: ReturnType<RmqContext['getMessage']>): Record<string, unknown> {
    return (message.properties.headers as Record<string, unknown>) ?? {};
  }

  private isValidationError(error: unknown): boolean {
    return error instanceof DomainException && error.code === DomainExceptionCode.ValidationError;
  }

  private buildRegistrationEmailParams(email: string, confirmationCode: string): SendEmailParams {
    const settings = NOTIFICATION_MESSAGE_REGISTRY[NotificationEvents.RegistrationEmailSent];

    return {
      to: email,
      subject: settings.subject,
      template: settings.template,
      context: {
        confirmationCode,
        confirmationLink: this.buildFrontendLink('confirm-email', confirmationCode),
      } satisfies MailTemplateContext,
    };
  }

  private buildPasswordRecoveryEmailParams(email: string, recoveryCode: string): SendEmailParams {
    const settings = NOTIFICATION_MESSAGE_REGISTRY[NotificationEvents.PasswordRecoveryEmailSent];

    return {
      to: email,
      subject: settings.subject,
      template: settings.template,
      context: {
        recoveryCode,
        recoveryLink: this.buildFrontendLink('password-recovery', recoveryCode),
      } satisfies MailTemplateContext,
    };
  }

  private buildFrontendLink(path: string, code: string): string {
    const normalizedFrontendUrl = this.notificationConfig.frontEndUrl.replace(/\/+$/, '');
    return `${normalizedFrontendUrl}/${path}?code=${encodeURIComponent(code)}`;
  }
}
