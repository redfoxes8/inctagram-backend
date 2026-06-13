import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Nack, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { PostDeletedMessageDto } from '../api/dto/post-deleted-message.dto';
import { DeleteFilesCommand } from '../application/use-cases/delete-files.use-case';

@Injectable()
export class FilesRabbitConsumer implements OnModuleInit {
  private readonly logger = new Logger(FilesRabbitConsumer.name);

  constructor(private readonly commandBus: CommandBus) {}

  onModuleInit(): void {
    this.logger.log(
      '[RABBIT] consumer provider registered queue=files_queue exchange=common_exchange routingKey=post.deleted',
    );
  }

  @RabbitSubscribe({
    exchange: 'common_exchange',
    routingKey: 'post.deleted',
    queue: 'files_queue',
  })
  async handlePostDeleted(msg: PostDeletedMessageDto): Promise<Nack | void> {
    try {
      // Short consumer log
      // eslint-disable-next-line no-console
      console.log('[RABBIT] consumer received fileIds=' + (msg.fileIds || []).join(','));

      await this.commandBus.execute(new DeleteFilesCommand(msg));

      // eslint-disable-next-line no-console
      console.log(
        '[RABBIT] consumer processed message for fileIds=' + (msg.fileIds || []).join(','),
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[RABBIT] consumer error: ' + (e?.message || e));
      return new Nack(false);
    }
  }
}
