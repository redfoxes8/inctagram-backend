import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Nack, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { PostDeletedMessageDto } from '../api/dto/post-deleted-message.dto';
import { DeleteFilesCommand } from '../application/use-cases/delete-files.use-case';
import type { IAvatarDeletedEvent } from '../../../../../../libs/contracts/src';

@Injectable()
export class FilesRabbitConsumer implements OnModuleInit {
  private readonly logger = new Logger(FilesRabbitConsumer.name);

  constructor(private readonly commandBus: CommandBus) {}

  onModuleInit(): void {
    this.logger.log(
      '[RABBIT] consumer provider registered queue=files_queue exchange=common_exchange routingKey=post.deleted,profile.avatar.deleted',
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

      console.log('[RABBIT] consumer received fileIds=' + (msg.fileIds || []).join(','));

      await this.commandBus.execute(new DeleteFilesCommand(msg));

      console.log(
        '[RABBIT] consumer processed message for fileIds=' + (msg.fileIds || []).join(','),
      );
    } catch (e) {
      console.error('[RABBIT] consumer error: ' + (e?.message || e));
      return new Nack(false);
    }
  }

  @RabbitSubscribe({
    exchange: 'common_exchange',
    routingKey: 'profile.avatar.deleted',
    queue: 'files_queue',
  })
  async handleAvatarDeleted(msg: IAvatarDeletedEvent): Promise<Nack | void> {
    try {
      console.log(
        `[RABBIT] consumer received avatar delete for userId=${msg.userId} previousAvatarFileId=${msg.previousAvatarFileId}`,
      );

      if (!msg.previousAvatarFileId) {
        console.warn(`[RABBIT] received avatar delete event with empty previousAvatarFileId`);
        return;
      }

      await this.commandBus.execute(
        new DeleteFilesCommand({ fileIds: [msg.previousAvatarFileId] }),
      );

      console.log(
        `[RABBIT] consumer processed avatar delete for previousAvatarFileId=${msg.previousAvatarFileId}`,
      );
    } catch (e) {
      console.error('[RABBIT] consumer error: ' + (e?.message || e));
      return new Nack(false);
    }
  }
}
