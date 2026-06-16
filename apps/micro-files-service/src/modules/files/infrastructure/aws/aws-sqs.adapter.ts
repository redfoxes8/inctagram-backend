import { Consumer } from 'sqs-consumer';
import { FilesConfig } from '../../../../core/files.config';
import { Message, SQSClient } from '@aws-sdk/client-sqs';
import { CommandBus } from '@nestjs/cqrs';
import { FileUploadedCommand } from '../../application/use-cases/file-uploaded.use-case';
import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

@Injectable()
export class AwsSqsAdapter implements OnModuleInit, OnModuleDestroy {
  private consumer: Consumer;
  constructor(
    @Inject(FilesConfig) private config: FilesConfig,
    private commandBus: CommandBus,
  ) {}

  onModuleInit() {
    this.consumer = Consumer.create({
      queueUrl: this.config.sqsQueueUrl,
      sqs: new SQSClient({
        region: this.config.awsRegion,
        credentials: {
          accessKeyId: this.config.awsAccessKeyId,
          secretAccessKey: this.config.awsSecretAccessKey,
        },
      }),
      handleMessage: async (message: Message): Promise<Message | undefined> => {
        if (!message || !message.Body) return message;

        const event = JSON.parse(message.Body);
        const records = event.Records;

        if (!Array.isArray(records) || records.length === 0) return message;

        const record = records[0];
        const fileKey: string | undefined = record.s3?.object?.key;

        if (!fileKey) return message;

        if (record.eventName?.startsWith('ObjectCreated')) {
          try {
            await this.commandBus.execute(new FileUploadedCommand(fileKey));
          } catch (e: any) {
            if (e.message === 'File not found') {
              console.warn(`[SQS] File record with key ${fileKey} not found in DB. Skipping.`);
              return message;
            }
            return undefined;
          }
        }
        return message;
      },
    });

    this.consumer.on('error', (err) => {
      console.error(err.message);
    });
    this.consumer.on('processing_error', (err) => {
      console.error(err.message);
    });
    this.consumer.on('timeout_error', (err) => {
      console.error(err.message);
    });

    this.consumer.start();
  }

  onModuleDestroy() {
    this.consumer.stop();
  }
}
