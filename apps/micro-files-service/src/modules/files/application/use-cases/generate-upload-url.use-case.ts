import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { IStorageAdapter } from '../interfaces/storage-adapter.interface';
import { IFilesRepository } from '../../domain/interfaces/files.repository.interface';
import { FileType, PresignedUrlResult } from '../../domain/file.types';

export class GenerateUploadUrlCommand {
  constructor(
    public readonly userId: string,
    public readonly fileName: string,
    public readonly fileType: FileType,
  ) {}
}

@CommandHandler(GenerateUploadUrlCommand)
export class GenerateUploadUrlUseCase implements ICommandHandler<GenerateUploadUrlCommand, PresignedUrlResult & { fileId: string }> {
  constructor(
    private readonly storageAdapter: IStorageAdapter,
    private readonly filesRepository: IFilesRepository,
  ) {}

  async execute(command: GenerateUploadUrlCommand): Promise<PresignedUrlResult & { fileId: string }> {
    const { userId, fileName, fileType } = command;

    // 1. Генерируем URL в хранилище
    const storageResult = await this.storageAdapter.generateUploadUrl(userId, fileName, fileType);

    // 2. Создаем запись в БД со статусом PENDING
    const fileRecord = await this.filesRepository.create({
      userId,
      s3Key: storageResult.s3Key,
      bucket: storageResult.bucket,
      fileType,
    });

    return {
      ...storageResult,
      fileId: fileRecord.id,
    };
  }
}
