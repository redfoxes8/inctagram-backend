import { Controller } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { EventPattern, Payload } from '@nestjs/microservices';
import { DeleteFilesCommand } from '../application/use-cases/delete-files.use-case';

export class FilesDeletedEvent {
  fileIds: string[];
}

@Controller()
export class FilesMessageController {
  constructor(private readonly commandBus: CommandBus) {}

  @EventPattern('post_deleted')
  async handlePostDeleted(@Payload() data: FilesDeletedEvent): Promise<void> {
    if (data && data.fileIds && data.fileIds.length > 0) {
      await this.commandBus.execute(new DeleteFilesCommand(data.fileIds));
    }
  }
}
