import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

import { configValidationUtility } from '../../../../libs/common/src/utils/config-validation.utility';

@Injectable()
export class FilesConfig {
  @IsNumber({}, { message: 'Set Env variable PORT, example: 3001' })
  port: number;

  @IsBoolean({ message: 'INCLUDE_TESTING_MODULE must be a boolean value' })
  @IsNotEmpty({ message: 'Set Env variable INCLUDE_TESTING_MODULE, example: false' })
  includeTestingModule: boolean;

  @IsString({ message: 'POST_SERVICE_GRPC_URL must be a string' })
  postServiceGrpcUrl: string;

  @IsString({ message: 'GRPC_HOST must be a string' })
  grpcHost: string;

  @IsNumber({}, { message: 'GRPC_PORT must be a number' })
  grpcPort: number;

  // AWS Configuration
  @IsString({ message: 'AWS_REGION must be a string' })
  awsRegion: string;

  @IsString({ message: 'AWS_ACCESS_KEY_ID must be a string' })
  awsAccessKeyId: string;

  @IsString({ message: 'AWS_SECRET_ACCESS_KEY must be a string' })
  awsSecretAccessKey: string;

  // S3 Buckets - разные бакеты для разных типов файлов
  @IsString({ message: 'S3_BUCKET_IMAGES must be a string' })
  s3BucketImages: string;

  @IsString({ message: 'S3_BUCKET_DOCUMENTS must be a string' })
  @IsOptional()
  s3BucketDocuments?: string;

  @IsString({ message: 'S3_BUCKET_MEDIA must be a string' })
  @IsOptional()
  s3BucketMedia?: string;

  @IsNotEmpty({ message: 'Set Env variable PRISMA_DB_URL, example: postgres://xxxxxx' })
  prismaDbUrl: string;

  // SQS Configuration
  @IsString({ message: 'SQS_QUEUE_URL must be a string' })
  sqsQueueUrl: string;

  // RabbitMQ Configuration
  @IsString({ message: 'RABBITMQ_URL must be a string' })
  rabbitmqUrl: string;

  @IsString({ message: 'FILES_EVENTS_QUEUE must be a string' })
  filesEventsQueue: string;

  // Database Configuration
  @IsString({ message: 'DATABASE_URL must be a string' })
  databaseUrl: string;

  constructor(private readonly configService: ConfigService<Record<string, string>, true>) {
    this.port = Number(this.configService.get('PORT'));
    this.prismaDbUrl = this.configService.get('PRISMA_DB_URL');
    this.includeTestingModule = configValidationUtility.convertToBoolean(
      this.configService.get('INCLUDE_TESTING_MODULE'),
    );
    this.postServiceGrpcUrl = this.configService.get('POST_SERVICE_GRPC_URL') || '0.0.0.0:50051';
    this.grpcHost = this.configService.get('GRPC_HOST') || '0.0.0.0';
    this.grpcPort = Number(this.configService.get('GRPC_PORT')) || 50052;

    // AWS Configuration
    this.awsRegion = this.configService.get('AWS_REGION') || 'eu-central-1';
    this.awsAccessKeyId = this.configService.get('AWS_ACCESS_KEY_ID');
    this.awsSecretAccessKey = this.configService.get('AWS_SECRET_ACCESS_KEY');

    // S3 Buckets
    this.s3BucketImages = this.configService.get('S3_BUCKET_IMAGES');
    this.s3BucketDocuments = this.configService.get('S3_BUCKET_DOCUMENTS');
    this.s3BucketMedia = this.configService.get('S3_BUCKET_MEDIA');

    // SQS Configuration
    this.sqsQueueUrl = this.configService.get('SQS_QUEUE_URL');

    // RabbitMQ Configuration
    this.rabbitmqUrl = this.configService.get('RABBITMQ_URL');
    this.filesEventsQueue = this.configService.get('FILES_EVENTS_QUEUE');

    // Database Configuration
    this.databaseUrl = this.configService.get('DATABASE_URL');

    configValidationUtility.validateConfig(this);
  }
}
