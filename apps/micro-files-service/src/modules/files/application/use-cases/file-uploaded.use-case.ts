import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import type { IFilesRepository } from '../../domain/interfaces/files.repository.interface';
import type { IAsyncEventPublisher } from '../interfaces/event-publisher.interface';

export class FileUploadedCommand {
  constructor(public fileKey: string) {}
}

@CommandHandler(FileUploadedCommand)
export class FileUploadedUseCase implements ICommandHandler<FileUploadedCommand, void> {
  constructor(
    private fileRepository: IFilesRepository,
    private eventPublisher: IAsyncEventPublisher,
  ) {}

  async execute({ fileKey }: FileUploadedCommand): Promise<void> {
    await this.fileRepository.findFileByKey(fileKey);
    await this.eventPublisher.sendFileUploadedEvent('');
    return;
  }
}
