import { Consumer } from 'sqs-consumer';
import { FilesConfig } from '../../../../core/files.config';
import { SQSClient } from '@aws-sdk/client-sqs';
import { CommandBus } from '@nestjs/cqrs';
import { FileUploadedCommand } from '../../application/use-cases/file-uploaded.use-case';

export class AwsSqsAdapter {
  private consumer: Consumer;
  constructor(
    private config: FilesConfig,
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
      handleMessage: async (message) => {
        if (message && message.Body) {
          const event = JSON.parse(message.Body);
          for (const record of event.Records) {
            if (record.eventName.startWith('ObjectCreated')) {
              const fileKey: string = record.s3.object.key;
              await this.commandBus.execute(new FileUploadedCommand(fileKey));
            }
          }
          return message;
        }
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
