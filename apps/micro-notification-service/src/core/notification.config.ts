import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsEmail, IsNotEmpty, IsPositive, IsString } from 'class-validator';

import { configValidationUtility } from '../../../../libs/common/src/utils/config-validation.utility';
import { NOTIFICATION_ENV_KEYS, NotificationEnvRecord } from './notification-env.constants';

@Injectable()
export class NotificationConfig {
  @IsPositive({ message: 'Set Env variable PORT, example: 3002' })
  port: number;

  @IsString()
  @IsNotEmpty({ message: 'Set Env variable FRONTEND_URL, example: https://inctagram.com' })
  frontEndUrl: string;

  @IsString()
  @IsNotEmpty({ message: 'Set Env variable RABBITMQ_URL, example: amqp://localhost:5672' })
  rabbitmqUrl: string;

  @IsString()
  @IsNotEmpty({
    message: 'Set Env variable NOTIFICATION_QUEUE_NAME, example: micro-notification-service',
  })
  notificationQueueName: string;

  @IsString()
  @IsNotEmpty({
    message:
      'Set Env variable NOTIFICATION_DEAD_LETTER_QUEUE_NAME, example: micro-notification-service-dlq',
  })
  notificationDeadLetterQueueName: string;

  @IsString()
  @IsNotEmpty({ message: 'Set Env variable SMTP_HOST, example: smtp.gmail.com' })
  smtpHost: string;

  @IsPositive({ message: 'Set Env variable SMTP_PORT, example: 587' })
  smtpPort: number;

  @IsString()
  @IsNotEmpty({ message: 'Set Env variable SMTP_USER' })
  smtpUser: string;

  @IsString()
  @IsNotEmpty({ message: 'Set Env variable SMTP_PASSWORD' })
  smtpPassword: string;

  private readonly smtpFromEmailValue: string;

  private readonly smtpFromNameValue: string;

  constructor(private readonly configService: ConfigService<NotificationEnvRecord, true>) {
    this.port = Number(this.configService.get(NOTIFICATION_ENV_KEYS.PORT));
    this.frontEndUrl = this.configService.get(NOTIFICATION_ENV_KEYS.FRONTEND_URL);
    this.rabbitmqUrl = this.configService.get(NOTIFICATION_ENV_KEYS.RABBITMQ_URL);
    this.notificationQueueName = this.configService.get(
      NOTIFICATION_ENV_KEYS.NOTIFICATION_QUEUE_NAME,
    );
    this.notificationDeadLetterQueueName = this.configService.get(
      NOTIFICATION_ENV_KEYS.NOTIFICATION_DEAD_LETTER_QUEUE_NAME,
    );
    this.smtpHost = this.configService.get(NOTIFICATION_ENV_KEYS.SMTP_HOST);
    this.smtpPort = Number(this.configService.get(NOTIFICATION_ENV_KEYS.SMTP_PORT));
    this.smtpUser = this.configService.get(NOTIFICATION_ENV_KEYS.SMTP_USER);
    this.smtpPassword = this.configService.get(NOTIFICATION_ENV_KEYS.SMTP_PASSWORD);
    this.smtpFromEmailValue = this.configService.get(NOTIFICATION_ENV_KEYS.SMTP_FROM_EMAIL);
    this.smtpFromNameValue = this.configService.get(NOTIFICATION_ENV_KEYS.SMTP_FROM_NAME);

    configValidationUtility.validateConfig(this);
  }

  @IsEmail({}, { message: 'Set Env variable SMTP_FROM_EMAIL, example: no-reply@inctagram.com' })
  public get smtpFromEmail(): string {
    return this.smtpFromEmailValue;
  }

  @IsString()
  @IsNotEmpty({ message: 'Set Env variable SMTP_FROM_NAME, example: Inctagram' })
  public get smtpFromName(): string {
    return this.smtpFromNameValue;
  }

  public get smtpSecure(): boolean {
    const explicitSecureValue = this.configService.get<string | undefined>('SMTP_SECURE');

    if (explicitSecureValue === 'true') {
      return true;
    }

    if (explicitSecureValue === 'false') {
      return false;
    }

    return this.smtpPort === 465;
  }
}
