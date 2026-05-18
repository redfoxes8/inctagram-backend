import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { IFilesRepository } from '../../domain/interfaces/files.repository.interface';
import { IStorageAdapter } from '../interfaces/storage-adapter.interface';
import { FileStatus } from '../../../../core/prisma/client';
import { FileType } from '../../domain/file.types';

export class DeleteFilesCommand {
  constructor(public readonly fileIds: string[]) {}
}

@CommandHandler(DeleteFilesCommand)
export class DeleteFilesUseCase implements ICommandHandler<DeleteFilesCommand, void> {
  constructor(
    private readonly filesRepository: IFilesRepository,
    private readonly storageAdapter: IStorageAdapter,
  ) {}

  async execute(command: DeleteFilesCommand): Promise<void> {
    const { fileIds } = command;
    if (!fileIds || fileIds.length === 0) return;

    // 1. Получаем информацию о файлах из БД
    const files = await this.filesRepository.findByIds(fileIds);
    if (files.length === 0) return;

    const idsToUpdate = files.map((f) => f.id);

    // 2. Временный статус DELETING для предотвращения гонок
    await this.filesRepository.updateStatusMany(idsToUpdate, FileStatus.DELETING);

    // 3. Группируем файлы по типам для удаления из соответствующих бакетов
    const filesByType: Record<FileType, typeof files> = {} as any;
    for (const file of files) {
      const type = file.fileType as FileType;
      if (!filesByType[type]) {
        filesByType[type] = [];
      }
      filesByType[type].push(file);
    }

    // 4. Запускаем параллельное удаление для каждого бакета (типа файла)
    const deletionPromises = Object.entries(filesByType).map(async ([type, typeFiles]) => {
      const keys = typeFiles.map((f) => f.s3Key);
      const typeFileIds = typeFiles.map((f) => f.id);
      try {
        await this.storageAdapter.deleteFiles(keys, type as FileType);
        // Успех: Жесткое удаление записей из БД
        await this.filesRepository.deleteMany(typeFileIds);
      } catch (error) {
        console.error(`[DeleteFilesUseCase] Failed to delete S3 files for type ${type}:`, error);
        // Сбой S3: Меняем статус в БД на FAILED_DELETE для повторной обработки в Cron
        await this.filesRepository.updateStatusMany(typeFileIds, FileStatus.FAILED_DELETE);
      }
    });

    await Promise.allSettled(deletionPromises);
  }
}
