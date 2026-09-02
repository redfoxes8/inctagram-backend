import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

import { configValidationUtility } from '../../../../libs/common/src/utils/config-validation.utility';

@Injectable()
export class PaymentConfig {
  // General Configuration
  @IsNumber({}, { message: 'Env variable PORT must be a number' })
  @IsNotEmpty({ message: 'Set Env variable PORT, example: 3001' })
  port: number;

  // gRPC Configuration
  @IsString({ message: 'Env variable GRPC_HOST must be a string' })
  @IsNotEmpty({ message: 'Set Env variable GRPC_HOST, example: 0.0.0.0' })
  grpcHost: string;

  @IsNumber({}, { message: 'GRPC_PORT must be a number' })
  @IsNotEmpty({ message: 'Set Env variable GRPC_PORT, example: 00000' })
  grpcPort: number;

  // Database Configuration
  @IsString({ message: 'Env variable DATABASE_URL must be a string' })
  @IsNotEmpty({ message: 'Set Env variable DATABASE_URL, example: http://xxxx' })
  databaseUrl: string;

  // Prisma Configuration
  @IsString({ message: 'PRISMA_DB_URL must be a string' })
  @IsNotEmpty({ message: 'Set Env variable PRISMA_DB_URL, example: postgres://xxxxxx' })
  prismaDbUrl: string;

  // RabbitMQ Configuration
  @ValidateIf((config: PaymentConfig) => config.outboxRelayEnabled)
  @IsString({ message: 'Env variable RABBITMQ_URL must be a string' })
  @IsNotEmpty({
    message: 'Set Env variable RABBITMQ_URL, example: amqps://xxxxx',
  })
  rabbitUrl: string | null;

  @IsBoolean({ message: 'PAYMENT_OUTBOX_RELAY_ENABLED must be true or false' })
  outboxRelayEnabled: boolean;

  @IsString({ message: 'PAYMENT_OUTBOX_RELAY_CRON must be a string' })
  @Matches(/^(?:\*|\*\/[1-9]\d*|\d+)(?:\s+(?:\*|\*\/[1-9]\d*|\d+)){5}$/, {
    message: 'PAYMENT_OUTBOX_RELAY_CRON must be a valid six-field cron expression',
  })
  outboxRelayCron: string;

  @IsInt({ message: 'PAYMENT_OUTBOX_RELAY_BATCH_SIZE must be an integer' })
  @Min(1, { message: 'PAYMENT_OUTBOX_RELAY_BATCH_SIZE must be at least 1' })
  @Max(100, { message: 'PAYMENT_OUTBOX_RELAY_BATCH_SIZE must not exceed 100' })
  outboxRelayBatchSize: number;

  @IsInt({ message: 'PAYMENT_OUTBOX_RELAY_MAX_ATTEMPTS must be an integer' })
  @Min(1, { message: 'PAYMENT_OUTBOX_RELAY_MAX_ATTEMPTS must be at least 1' })
  @Max(20, { message: 'PAYMENT_OUTBOX_RELAY_MAX_ATTEMPTS must not exceed 20' })
  outboxRelayMaxAttempts: number;

  @IsInt({ message: 'PAYMENT_OUTBOX_RELAY_BACKOFF_SECONDS must be an integer' })
  @Min(1, { message: 'PAYMENT_OUTBOX_RELAY_BACKOFF_SECONDS must be at least 1' })
  @Max(3600, { message: 'PAYMENT_OUTBOX_RELAY_BACKOFF_SECONDS must not exceed 3600' })
  outboxRelayBackoffSeconds: number;

  @IsInt({ message: 'PAYMENT_OUTBOX_RELAY_LOCK_TIMEOUT_SECONDS must be an integer' })
  @Min(5, { message: 'PAYMENT_OUTBOX_RELAY_LOCK_TIMEOUT_SECONDS must be at least 5' })
  @Max(3600, { message: 'PAYMENT_OUTBOX_RELAY_LOCK_TIMEOUT_SECONDS must not exceed 3600' })
  outboxRelayLockTimeoutSeconds: number;

  // Stripe Configuration
  @IsString({ message: 'Env variable STRIPE_SECRET_KEY must be a string' })
  @IsNotEmpty({ message: 'Env variable STRIPE_SECRET_KEY is required' })
  @Matches(/^sk_test_/, {
    message: 'Env variable STRIPE_SECRET_KEY must be a Stripe test key',
  })
  stripeSecretKey: string;

  @IsString({ message: 'Env variable STRIPE_WEBHOOK_SECRET must be a string' })
  @IsNotEmpty({ message: 'Env variable STRIPE_WEBHOOK_SECRET is required' })
  @Matches(/^whsec_/, {
    message: 'Env variable STRIPE_WEBHOOK_SECRET must be a webhook signing secret',
  })
  stripeWebhookSecret: string;

  @IsIn(['test'], {
    message: 'Env variable PAYMENT_PROVIDER_ENVIRONMENT must be test',
  })
  @IsNotEmpty({ message: 'Env variable PAYMENT_PROVIDER_ENVIRONMENT is required' })
  providerEnvironment: 'test';

  @IsInt({ message: 'PAYMENT_WEBHOOK_PROCESSING_TIMEOUT_SECONDS must be an integer' })
  @Min(10, { message: 'PAYMENT_WEBHOOK_PROCESSING_TIMEOUT_SECONDS must be at least 10' })
  @Max(900, { message: 'PAYMENT_WEBHOOK_PROCESSING_TIMEOUT_SECONDS must not exceed 900' })
  webhookProcessingTimeoutSeconds: number;

  // PayPal Configuration
  paypalClientId: string | null;
  paypalClientSecret: string | null;
  paypalWebhookId: string | null;
  paypalMode: string | null;

  // Subscription lifecycle configuration
  @IsBoolean({ message: 'SUBSCRIPTION_LIFECYCLE_ENABLED must be true or false' })
  subscriptionLifecycleEnabled: boolean;

  @IsString({ message: 'Env variable SUBSCRIPTION_CHECK_CRON must be a string' })
  @Matches(/^(?:\*|\*\/[1-9]\d*|\d+)(?:\s+(?:\*|\*\/[1-9]\d*|\d+)){5}$/, {
    message: 'SUBSCRIPTION_CHECK_CRON must be a valid six-field cron expression',
  })
  subscriptionCheckCron: string;

  @IsInt({ message: 'SUBSCRIPTION_LIFECYCLE_BATCH_SIZE must be an integer' })
  @Min(1, { message: 'SUBSCRIPTION_LIFECYCLE_BATCH_SIZE must be at least 1' })
  @Max(100, { message: 'SUBSCRIPTION_LIFECYCLE_BATCH_SIZE must not exceed 100' })
  subscriptionLifecycleBatchSize: number;

  paymentNotificationRecoveryEnabled: boolean;
  paymentNotificationRecoveryBatchSize: number;

  constructor(private readonly configService: ConfigService<Record<string, string>, true>) {
    this.port = Number(this.configService.get('PORT'));

    this.grpcHost = this.configService.get('GRPC_HOST');

    this.grpcPort = Number(this.configService.get('GRPC_PORT'));

    this.databaseUrl = this.configService.get('DATABASE_URL');

    this.prismaDbUrl = this.configService.get('PRISMA_DB_URL');

    this.outboxRelayEnabled = PaymentConfig.requiredBoolean(
      this.configService.get('PAYMENT_OUTBOX_RELAY_ENABLED'),
      'PAYMENT_OUTBOX_RELAY_ENABLED',
    );

    this.rabbitUrl = this.configService.get('RABBITMQ_URL') ?? null;

    this.outboxRelayCron = this.configService.get('PAYMENT_OUTBOX_RELAY_CRON');

    this.outboxRelayBatchSize = Number(this.configService.get('PAYMENT_OUTBOX_RELAY_BATCH_SIZE'));

    this.outboxRelayMaxAttempts = Number(
      this.configService.get('PAYMENT_OUTBOX_RELAY_MAX_ATTEMPTS'),
    );

    this.outboxRelayBackoffSeconds = Number(
      this.configService.get('PAYMENT_OUTBOX_RELAY_BACKOFF_SECONDS'),
    );

    this.outboxRelayLockTimeoutSeconds = Number(
      this.configService.get('PAYMENT_OUTBOX_RELAY_LOCK_TIMEOUT_SECONDS'),
    );

    this.stripeSecretKey = this.configService.get('STRIPE_SECRET_KEY');

    this.stripeWebhookSecret = this.configService.get('STRIPE_WEBHOOK_SECRET');

    this.providerEnvironment = this.configService.get('PAYMENT_PROVIDER_ENVIRONMENT') as 'test';

    this.webhookProcessingTimeoutSeconds = Number(
      this.configService.get('PAYMENT_WEBHOOK_PROCESSING_TIMEOUT_SECONDS'),
    );

    this.paypalClientId = this.configService.get('PAYPAL_CLIENT_ID') ?? null;

    this.paypalClientSecret = this.configService.get('PAYPAL_CLIENT_SECRET') ?? null;

    this.paypalWebhookId = this.configService.get('PAYPAL_WEBHOOK_ID') ?? null;

    this.paypalMode = this.configService.get('PAYPAL_MODE') ?? null;

    this.subscriptionLifecycleEnabled = PaymentConfig.requiredBoolean(
      this.configService.get('SUBSCRIPTION_LIFECYCLE_ENABLED'),
      'SUBSCRIPTION_LIFECYCLE_ENABLED',
    );

    this.subscriptionCheckCron = this.configService.get('SUBSCRIPTION_CHECK_CRON');

    this.subscriptionLifecycleBatchSize = Number(
      this.configService.get('SUBSCRIPTION_LIFECYCLE_BATCH_SIZE'),
    );

    this.paymentNotificationRecoveryEnabled =
      this.configService.get('PAYMENT_NOTIFICATION_RECOVERY_ENABLED') === 'true';
    this.paymentNotificationRecoveryBatchSize = Number(
      this.configService.get('PAYMENT_NOTIFICATION_RECOVERY_BATCH_SIZE') ?? '20',
    );

    configValidationUtility.validateConfig(this);
    PaymentConfig.assertCron(this.outboxRelayCron, 'PAYMENT_OUTBOX_RELAY_CRON');
    PaymentConfig.assertCron(this.subscriptionCheckCron, 'SUBSCRIPTION_CHECK_CRON');
  }

  private static requiredBoolean(value: string | undefined, variableName: string): boolean {
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new Error(`${variableName} must be true or false`);
  }

  private static assertCron(expression: string, variableName: string): void {
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
    if (!valid) throw new Error(`${variableName} must be a valid six-field cron expression`);
  }
}
