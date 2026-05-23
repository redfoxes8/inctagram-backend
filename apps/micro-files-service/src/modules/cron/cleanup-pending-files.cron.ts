import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IFilesRepository } from '../files/domain/interfaces/files.repository.interface';
import { IStorageAdapter } from '../files/infrastructure/interfaces/storage-adapter.interface';
import { FileType } from '../files/domain/file.types';
import { FileStatus } from '../../core/prisma/client';

@Injectable()
export class CleanupPendingFilesCron {
  private readonly logger = new Logger(CleanupPendingFilesCron.name);

  constructor(
    private readonly filesRepository: IFilesRepository,
    private readonly storageAdapter: IStorageAdapter,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupOrphanedPendingFiles(): Promise<void> {
    this.logger.log('Starting cleanup of orphaned PENDING files...');

    const olderThan = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 часа назад
    const limit = 500;
    let processedCount = 0;

    try {
      while (true) {
        // 1. Получаем пачку PENDING файлов
        const pendingFiles = await this.filesRepository.findPendingOlderThan(olderThan, limit);
        if (pendingFiles.length === 0) break;

        this.logger.log(`Found ${pendingFiles.length} pending files to clean up.`);

        // Временный перевод в статус DELETING
        const ids = pendingFiles.map((f) => f.id);
        await this.filesRepository.updateStatusMany(ids, FileStatus.DELETING);

        // 2. Группируем по типу
        const filesByType: Record<FileType, typeof pendingFiles> = {} as any;
        for (const file of pendingFiles) {
          const type = file.fileType as FileType;
          if (!filesByType[type]) {
            filesByType[type] = [];
          }
          filesByType[type].push(file);
        }

        // 3. Массовое удаление из S3 и БД
        for (const [type, typeFiles] of Object.entries(filesByType)) {
          const keys = typeFiles.map((f) => f.s3Key);
          const typeIds = typeFiles.map((f) => f.id);

          try {
            await this.storageAdapter.deleteFiles(keys, type as FileType);
            await this.filesRepository.deleteMany(typeIds);
            processedCount += typeIds.length;
          } catch (err) {
            this.logger.error(
              `Failed to delete S3 pending files for type ${type}: ${err instanceof Error ? err.message : String(err)}`,
            );
            // Если упало, переводим в FAILED_DELETE для повторной попытки
            await this.filesRepository.updateStatusMany(typeIds, FileStatus.FAILED_DELETE);
          }
        }

        // Задержка между чанками
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      this.logger.log(
        `Cleanup of orphaned PENDING files complete. Cleaned up ${processedCount} files.`,
      );
    } catch (error) {
      this.logger.error(
        `Error occurred during cleanup of orphaned PENDING files: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async retryFailedDeletes(): Promise<void> {
    this.logger.log('Starting retry of FAILED_DELETE files...');

    const limit = 500;
    let processedCount = 0;

    try {
      while (true) {
        const failedFiles = await this.filesRepository.findFailedDeleteFiles(limit);
        if (failedFiles.length === 0) break;

        this.logger.log(`Found ${failedFiles.length} failed delete files to retry.`);

        // Временный перевод в DELETING
        const ids = failedFiles.map((f) => f.id);
        await this.filesRepository.updateStatusMany(ids, FileStatus.DELETING);

        // Группируем по типу
        const filesByType: Record<FileType, typeof failedFiles> = {} as any;
        for (const file of failedFiles) {
          const type = file.fileType as FileType;
          if (!filesByType[type]) {
            filesByType[type] = [];
          }
          filesByType[type].push(file);
        }

        // Массовое удаление из S3 и БД
        for (const [type, typeFiles] of Object.entries(filesByType)) {
          const keys = typeFiles.map((f) => f.s3Key);
          const typeIds = typeFiles.map((f) => f.id);

          try {
            await this.storageAdapter.deleteFiles(keys, type as FileType);
            await this.filesRepository.deleteMany(typeIds);
            processedCount += typeIds.length;
          } catch (err) {
            this.logger.error(
              `Retry failed to delete S3 files for type ${type}: ${err instanceof Error ? err.message : String(err)}`,
            );
            await this.filesRepository.updateStatusMany(typeIds, FileStatus.FAILED_DELETE);
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      this.logger.log(`Retry of FAILED_DELETE files complete. Cleaned up ${processedCount} files.`);
    } catch (error) {
      this.logger.error(
        `Error occurred during retry of FAILED_DELETE files: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
