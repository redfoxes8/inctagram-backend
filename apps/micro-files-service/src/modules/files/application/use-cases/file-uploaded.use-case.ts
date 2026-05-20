import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import type { IFilesRepository } from '../../domain/interfaces/files.repository.interface';
import type { IAsyncEventPublisher } from '../interfaces/event-publisher.interface';
import { FileEntity } from '../../domain/file.entity';
import { DomainException, DomainExceptionCode } from '@inctagram/common';
import { FileStatus } from '../../domain/file.types';

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
    const fileEntity: FileEntity | null = await this.fileRepository.findFileByKey(fileKey);
    if (!fileEntity) {
      throw new DomainException({ message: 'File not found', code: DomainExceptionCode.NotFound });
    }
    if (fileEntity.getStatus() == FileStatus.UPLOADED) {
      await this.eventPublisher.sendFileUploadedEvent({
        fileId: fileEntity.id,
        userId: fileEntity.getUserId(),
        s3Key: fileEntity.getS3Key(),
        bucket: fileEntity.getBucket(),
        fileType: fileEntity.getFileType(),
        fileExtension: fileEntity.getFileExtension(),
      });
      return;
    } else {
      fileEntity.updateStatus(FileStatus.UPLOADED);
      await this.fileRepository.updateStatus(fileEntity);
      await this.eventPublisher.sendFileUploadedEvent({
        fileId: fileEntity.id,
        userId: fileEntity.getUserId(),
        s3Key: fileEntity.getS3Key(),
        bucket: fileEntity.getBucket(),
        fileType: fileEntity.getFileType(),
        fileExtension: fileEntity.getFileExtension(),
      });
      return;
    }
  }
}
