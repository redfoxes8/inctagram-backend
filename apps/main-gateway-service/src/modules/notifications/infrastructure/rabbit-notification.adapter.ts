import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { defaultIfEmpty, lastValueFrom } from 'rxjs';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';

import { IEmailAdapter } from '../../auth/application/interfaces/email.adapter.interface';
import {
  NOTIFICATION_CLIENT,
  NotificationEvents,
  PasswordRecoveryEmailSentPayload,
  RegistrationEmailSentPayload,
} from '../notification.constants';

@Injectable()
export class RabbitNotificationAdapter implements IEmailAdapter {
  constructor(
    @Inject(NOTIFICATION_CLIENT)
    private readonly notificationClient: ClientProxy,
  ) {}

  public async sendRegistrationCode(email: string, code: string): Promise<void> {
    const payload: RegistrationEmailSentPayload = {
      email,
      confirmationCode: code,
    };

    await this.emitNotification(NotificationEvents.RegistrationEmailSent, payload);
  }

  public async sendPasswordRecoveryCode(email: string, code: string): Promise<void> {
    const payload: PasswordRecoveryEmailSentPayload = {
      email,
      recoveryCode: code,
    };

    await this.emitNotification(NotificationEvents.PasswordRecoveryEmailSent, payload);
  }

  private async emitNotification(
    event: NotificationEvents,
    payload: RegistrationEmailSentPayload | PasswordRecoveryEmailSentPayload,
  ): Promise<void> {
    try {
      await lastValueFrom(
        this.notificationClient.emit(event, payload).pipe(defaultIfEmpty(undefined)),
      );
    } catch (error: unknown) {
      throw new DomainException({
        code: DomainExceptionCode.InternalServerError,
        message: this.formatErrorMessage(event, error),
      });
    }
  }

  private formatErrorMessage(event: NotificationEvents, error: unknown): string {
    const errorMessage = error instanceof Error ? error.message : 'Unknown notification error';

    return `Failed to emit ${event}: ${errorMessage}`;
  }
}
