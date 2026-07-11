import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

import { configValidationUtility } from '../../../../libs/common/src/utils/config-validation.utility';

@Injectable()
export class FilesConfig {
  // General Configuration
  @IsNumber({}, { message: 'Env variable PORT must be a number' })
  @IsNotEmpty({ message: 'Set Env variable PORT, example: 3001' })
  port: number;

  @IsBoolean({ message: 'INCLUDE_TESTING_MODULE must be a boolean value' })
  @IsNotEmpty({ message: 'Set Env variable INCLUDE_TESTING_MODULE, example: false' })
  includeTestingModule: boolean;

  // gRPC Configuration
  @IsString({ message: 'POST_SERVICE_GRPC_URL must be a string' })
  @IsNotEmpty({ message: 'Set Env variable POST_SERVICE_GRPC_URL, example: 0.0.0.0:00000' })
  postServiceGrpcUrl: string;

  @IsString({ message: 'GRPC_HOST must be a string' })
  @IsNotEmpty({ message: 'Set Env variable GRPC_HOST, example: 0.0.0.0' })
  grpcHost: string;

  @IsNumber({}, { message: 'GRPC_PORT must be a number' })
  @IsNotEmpty({ message: 'Set Env variable GRPC_PORT, example: 00000' })
  grpcPort: number;

  // AWS Configuration
  @IsString({ message: 'AWS_REGION must be a string' })
  @IsNotEmpty({ message: 'Set Env variable AWS_REGION, example: eu-central-1' })
  awsRegion: string;

  @IsString({ message: 'AWS_ACCESS_KEY_ID must be a string' })
  @IsNotEmpty({ message: 'Set Env variable AWS_ACCESS_KEY_ID, example: XXX123XXX' })
  awsAccessKeyId: string;

  @IsString({ message: 'AWS_SECRET_ACCESS_KEY must be a string' })
  @IsNotEmpty({ message: 'Set Env variable AWS_SECRET_ACCESS_KEY, example: aa111BB322C' })
  awsSecretAccessKey: string;

  // S3 Buckets - разные бакеты для разных типов файлов
  @IsString({ message: 'S3_BUCKET_IMAGES must be a string' })
  @IsNotEmpty({
    message: 'Set Env variable S3_BUCKET_IMAGES, example: images-1234-eu-central-1-an',
  })
  s3BucketImages: string;

  @IsOptional()
  @IsString({ message: 'S3_BUCKET_DOCUMENTS must be a string' })
  s3BucketDocuments?: string;

  @IsOptional()
  @IsString({ message: 'S3_BUCKET_MEDIA must be a string' })
  s3BucketMedia?: string;

  // SQS Configuration
  @IsString({ message: 'SQS_QUEUE_URL must be a string' })
  @IsNotEmpty({
    message: 'Set Env variable SQS_QUEUE_URL, example: https://sqs.eu-central-1.amazonaws.com/xxxx',
  })
  sqsQueueUrl: string;

  // RabbitMQ Configuration
  @IsString({ message: 'RABBITMQ_URL must be a string' })
  @IsNotEmpty({
    message: 'Set Env variable RABBITMQ_URL, example: amqps://xxxxx',
  })
  rabbitmqUrl: string;

  @IsString({ message: 'FILES_EVENTS_QUEUE must be a string' })
  @IsNotEmpty({ message: 'Set Env variable FILES_EVENTS_QUEUE, example: file-queue' })
  filesEventsQueue: string;

  // Prisma Configuration
  @IsString({ message: 'PRISMA_DB_URL must be a string' })
  @IsNotEmpty({ message: 'Set Env variable PRISMA_DB_URL, example: postgres://xxxxxx' })
  prismaDbUrl: string;

  constructor(private readonly configService: ConfigService<Record<string, string>, true>) {
    // General Configuration
    this.port = Number(this.configService.get('PORT'));
    this.includeTestingModule = configValidationUtility.convertToBoolean(
      this.configService.get('INCLUDE_TESTING_MODULE'),
    );

    // gRPC Configuration
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

    // Prisma Configuration
    this.prismaDbUrl = this.configService.get('PRISMA_DB_URL');

    configValidationUtility.validateConfig(this);
  }
}
