import { Consumer } from 'sqs-consumer';
import { FilesConfig } from '../../../../core/files.config';
import { Message, SQSClient } from '@aws-sdk/client-sqs';
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
      handleMessage: async (message: Message): Promise<Message | undefined> => {
        if (message && message.Body) {
          const event = JSON.parse(message.Body);
          const fileKey: string = event.s3.object.key;
          if (event.eventName.startsWith('ObjectCreated')) {
            try {
              await this.commandBus.execute(new FileUploadedCommand(fileKey));
            } catch (e) {
              if (e.message == 'File not found') {
                console.warn(`[SQS] File record with key ${fileKey} not found in DB. Skipping.`);
                return message;
              } else {
                return undefined;
              }
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
