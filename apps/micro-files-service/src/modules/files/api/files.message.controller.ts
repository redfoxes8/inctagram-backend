import { Controller } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { DeleteFilesCommand } from '../application/use-cases/delete-files.use-case';
import { Nack, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { PostDeletedMessageDto } from './dto/post-deleted-message.dto';

@Controller()
export class FilesMessageController {
  constructor(private readonly commandBus: CommandBus) {}

  @RabbitSubscribe({
    exchange: 'common_exchange',
    routingKey: 'post.deleted',
    queue: 'files_queue',
  })
  async handlePostDeleted(msg: PostDeletedMessageDto): Promise<Nack | void> {
    try {
      await this.commandBus.execute(new DeleteFilesCommand(msg));
    } catch (e) {
      console.error(e.message);
      return new Nack(false);
    }
  }
}
