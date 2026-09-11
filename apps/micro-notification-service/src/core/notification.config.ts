import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

import { configValidationUtility } from '../../../../libs/common/src/utils/config-validation.utility';
import {
  NOTIFICATION_ENV_KEYS,
  NotificationEnvKey,
  NotificationEnvRecord,
} from './notification-env.constants';

@Injectable()
export class NotificationConfig {
  @IsPositive({ message: 'Set Env variable PORT, example: 3002' })
  port: number;

  @IsString()
  @IsNotEmpty()
  grpcHost: string;

  @IsInt()
  @Min(1)
  grpcPort: number;

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
  @IsInt({ message: 'SMTP_PORT must be a positive integer' })
  smtpPort: number;

  @IsString()
  @IsOptional()
  @IsNotEmpty({ message: 'SMTP_USER must not be empty when SMTP authentication is used' })
  smtpUser: string | undefined;

  @IsString()
  @IsOptional()
  @IsNotEmpty({ message: 'SMTP_PASSWORD must not be empty when SMTP authentication is used' })
  smtpPassword: string | undefined;

  @IsBoolean({ message: 'SMTP_SECURE must be true or false' })
  smtpSecure: boolean;

  private readonly smtpFromEmailValue: string;

  private readonly smtpFromNameValue: string;

  @IsString()
  @IsNotEmpty({ message: 'Set Env variable GATEWAY_SERVICE_GRPC_URL, example: localhost:50050' })
  gatewayServiceGrpcUrl: string;

  @IsString()
  @IsNotEmpty({ message: 'Set Env variable PRISMA_DB_URL for Notification DB' })
  prismaDbUrl: string;

  @IsInt()
  @Min(100)
  recipientGrpcTimeoutMs: number;

  @IsInt()
  @Min(0)
  recipientGrpcMaxRetries: number;

  @IsInt()
  @Min(0)
  recipientGrpcRetryBackoffMs: number;

  @IsString()
  @IsNotEmpty()
  paymentNotificationQueueName: string;

  @IsString()
  @IsNotEmpty()
  paymentNotificationDlqName: string;

  @IsInt()
  @Min(1)
  paymentNotificationMaxAttempts: number;

  @IsInt()
  @Min(0)
  paymentNotificationRetryBackoffMs: number;

  @IsInt()
  @Min(1)
  paymentNotificationProcessingTimeoutSeconds: number;

  @IsBoolean()
  notificationCleanupEnabled: boolean;

  @IsString()
  @Matches(/^(?:\*|\*\/[1-9]\d*|\d+)(?:\s+(?:\*|\*\/[1-9]\d*|\d+)){5}$/)
  notificationCleanupCron: string;

  @IsInt()
  @Min(1)
  @Max(3650)
  notificationCleanupRetentionDays: number;

  @IsInt()
  @Min(1)
  @Max(1000)
  notificationCleanupBatchSize: number;

  @IsInt()
  @Min(1)
  @Max(100)
  notificationCleanupMaxBatchesPerRun: number;

  constructor(private readonly configService: ConfigService<NotificationEnvRecord, true>) {
    this.port = Number(this.configService.get(NOTIFICATION_ENV_KEYS.PORT));
    this.grpcHost = this.readString(NOTIFICATION_ENV_KEYS.NOTIFICATION_GRPC_HOST, '0.0.0.0');
    this.grpcPort = this.readPositiveInt(NOTIFICATION_ENV_KEYS.NOTIFICATION_GRPC_PORT, 50054, 1);
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
    this.smtpUser = this.optionalCredential(NOTIFICATION_ENV_KEYS.SMTP_USER);
    this.smtpPassword = this.optionalCredential(NOTIFICATION_ENV_KEYS.SMTP_PASSWORD);
    this.smtpSecure = this.requiredBoolean(
      this.configService.get(NOTIFICATION_ENV_KEYS.SMTP_SECURE),
      NOTIFICATION_ENV_KEYS.SMTP_SECURE,
    );
    this.smtpFromEmailValue = this.configService.get(NOTIFICATION_ENV_KEYS.SMTP_FROM_EMAIL);
    this.smtpFromNameValue = this.configService.get(NOTIFICATION_ENV_KEYS.SMTP_FROM_NAME);
    this.gatewayServiceGrpcUrl = this.configService.get(
      NOTIFICATION_ENV_KEYS.GATEWAY_SERVICE_GRPC_URL,
    );
    this.prismaDbUrl = this.configService.get(NOTIFICATION_ENV_KEYS.PRISMA_DB_URL);
    this.recipientGrpcTimeoutMs = this.readPositiveInt(
      NOTIFICATION_ENV_KEYS.NOTIFICATION_RECIPIENT_GRPC_TIMEOUT_MS,
      2000,
    );
    this.recipientGrpcMaxRetries = this.readNonNegativeInt(
      NOTIFICATION_ENV_KEYS.NOTIFICATION_RECIPIENT_GRPC_MAX_RETRIES,
      2,
    );
    this.recipientGrpcRetryBackoffMs = this.readNonNegativeInt(
      NOTIFICATION_ENV_KEYS.NOTIFICATION_RECIPIENT_GRPC_RETRY_BACKOFF_MS,
      100,
    );
    this.paymentNotificationQueueName = this.readString(
      NOTIFICATION_ENV_KEYS.PAYMENT_NOTIFICATION_QUEUE_NAME,
      'payment-notification-queue',
    );
    this.paymentNotificationDlqName = this.readString(
      NOTIFICATION_ENV_KEYS.PAYMENT_NOTIFICATION_DLQ_NAME,
      'payment-notification-dlq',
    );
    this.paymentNotificationMaxAttempts = this.readPositiveInt(
      NOTIFICATION_ENV_KEYS.PAYMENT_NOTIFICATION_MAX_ATTEMPTS,
      3,
      1,
    );
    this.paymentNotificationRetryBackoffMs = this.readNonNegativeInt(
      NOTIFICATION_ENV_KEYS.PAYMENT_NOTIFICATION_RETRY_BACKOFF_MS,
      1000,
    );
    this.paymentNotificationProcessingTimeoutSeconds = this.readPositiveInt(
      NOTIFICATION_ENV_KEYS.PAYMENT_NOTIFICATION_PROCESSING_TIMEOUT_SECONDS,
      300,
      1,
    );
    this.notificationCleanupEnabled = this.requiredBoolean(
      this.configService.get(NOTIFICATION_ENV_KEYS.NOTIFICATION_CLEANUP_ENABLED) ?? 'false',
      NOTIFICATION_ENV_KEYS.NOTIFICATION_CLEANUP_ENABLED,
    );
    this.notificationCleanupCron =
      this.configService.get(NOTIFICATION_ENV_KEYS.NOTIFICATION_CLEANUP_CRON) ?? '0 0 3 * * *';
    this.notificationCleanupRetentionDays = this.readBoundedInt(
      NOTIFICATION_ENV_KEYS.NOTIFICATION_CLEANUP_RETENTION_DAYS,
      90,
      1,
      3650,
    );
    this.notificationCleanupBatchSize = this.readBoundedInt(
      NOTIFICATION_ENV_KEYS.NOTIFICATION_CLEANUP_BATCH_SIZE,
      100,
      1,
      1000,
    );
    this.notificationCleanupMaxBatchesPerRun = this.readBoundedInt(
      NOTIFICATION_ENV_KEYS.NOTIFICATION_CLEANUP_MAX_BATCHES_PER_RUN,
      5,
      1,
      100,
    );

    configValidationUtility.validateConfig(this);
    this.assertSmtpCredentialPair();
    this.assertCron(this.notificationCleanupCron);
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

  private optionalCredential(key: NotificationEnvKey): string | undefined {
    const value = this.configService.get<string | undefined>(key)?.trim();
    return value || undefined;
  }

  private requiredBoolean(value: string | undefined, variableName: string): boolean {
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new Error(`${variableName} must be true or false`);
  }

  private assertSmtpCredentialPair(): void {
    if ((this.smtpUser === undefined) === (this.smtpPassword === undefined)) return;
    throw new Error('SMTP_USER and SMTP_PASSWORD must both be set or both be empty');
  }

  private readPositiveInt(key: NotificationEnvKey, defaultValue: number, minimum = 100): number {
    const value = Number(this.configService.get<string | undefined>(key));
    return Number.isInteger(value) && value >= minimum ? value : defaultValue;
  }

  private readNonNegativeInt(key: NotificationEnvKey, defaultValue: number): number {
    const value = Number(this.configService.get<string | undefined>(key));
    return Number.isInteger(value) && value >= 0 ? value : defaultValue;
  }

  private readBoundedInt(
    key: NotificationEnvKey,
    defaultValue: number,
    minimum: number,
    maximum: number,
  ): number {
    const value = this.configService.get<string | undefined>(key);
    if (value === undefined) return defaultValue;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
      throw new Error(`${key} must be an integer between ${minimum} and ${maximum}`);
    }
    return parsed;
  }

  private assertCron(expression: string): void {
    const limits = [59, 59, 23, 31, 12, 6];
    const fields = expression.split(/\s+/u);
    const valid =
      fields.length === limits.length &&
      fields.every((field, index) => {
        if (field === '*') return true;
        if (field.startsWith('*/')) {
          const step = Number(field.slice(2));
          return Number.isInteger(step) && step > 0 && step <= limits[index] + 1;
        }
        const value = Number(field);
        const minimum = index === 3 || index === 4 ? 1 : 0;
        return Number.isInteger(value) && value >= minimum && value <= limits[index];
      });
    if (!valid)
      throw new Error('NOTIFICATION_CLEANUP_CRON must be a valid six-field cron expression');
  }

  private readString(key: NotificationEnvKey, defaultValue: string): string {
    const value = this.configService.get<string | undefined>(key);
    return value?.trim() || defaultValue;
  }
}
