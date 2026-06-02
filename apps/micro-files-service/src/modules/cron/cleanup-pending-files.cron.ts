import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IFilesRepository } from '../files/domain/interfaces/files.repository.interface';
import { IStorageAdapter } from '../files/infrastructure/interfaces/storage-adapter.interface';
import { FileStatusDomain } from '../files/domain/file.types';
import { FileEntity } from '../files/domain/file.entity';

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

    const olderThan: Date = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 часа назад
    const limit: number = 500;
    let processedCount: number = 0;

    try {
      while (true) {
        // 1. Получаем пачку PENDING файлов
        const pendingFiles: FileEntity[] = await this.filesRepository.findPendingOlderThan(
          olderThan,
          limit,
        );
        if (pendingFiles.length === 0) break;

        this.logger.log(`Found ${pendingFiles.length} pending files to clean up.`);

        // Временный перевод в статус DELETING
        const ids: string[] = pendingFiles.map((f) => f.id);
        await this.filesRepository.updateStatusMany(ids, FileStatusDomain.DELETING);

        // 2. Группируем по bucket
        const filesToDelete: Record<string, string[]> = pendingFiles.reduce(
          (acc, file) => {
            const bucket: string = file.getBucket();
            const s3Key: string = file.getS3Key();
            acc[bucket] = acc[bucket] || [];
            acc[bucket].push(s3Key);
            return acc;
          },
          {} as Record<string, string[]>,
        );

        // 3. Массовое удаление из S3 и БД
        const buckets: string[] = Object.keys(filesToDelete);
        buckets.map(async (bucket) => {
          try {
            await this.storageAdapter.deleteFiles(bucket, filesToDelete[bucket]);
            await this.filesRepository.deleteManyByS3Key(filesToDelete[bucket]);
            processedCount += filesToDelete[bucket].length;
            return;
          } catch (e) {
            this.logger.error(
              `Failed to delete S3 pending files for bucket ${bucket}: ${e instanceof Error ? e.message : String(e)}`,
            );
            // Если упало, переводим в FAILED_DELETE для повторной попытки
            await this.filesRepository.updateStatusManyByS3Key(
              filesToDelete[bucket],
              FileStatusDomain.FAILED_DELETE,
            );
            return;
          }
        });

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

    const limit: number = 500;
    let processedCount: number = 0;

    try {
      while (true) {
        // 1. Получаем массив Failed To Delete файлов
        const failedFiles: FileEntity[] = await this.filesRepository.findFailedDeleteFiles(limit);
        if (failedFiles.length === 0) break;

        this.logger.log(`Found ${failedFiles.length} failed delete files to retry.`);

        // Временный перевод в DELETING
        const ids: string[] = failedFiles.map((f) => f.id);
        await this.filesRepository.updateStatusMany(ids, FileStatusDomain.DELETING);

        // 2. Группируем по bucket
        const filesToDelete: Record<string, string[]> = failedFiles.reduce(
          (acc, file) => {
            const bucket: string = file.getBucket();
            const s3Key: string = file.getS3Key();
            acc[bucket] = acc[bucket] || [];
            acc[bucket].push(s3Key);
            return acc;
          },
          {} as Record<string, string[]>,
        );

        // 3. Массовое удаление из S3 и БД
        const buckets: string[] = Object.keys(filesToDelete);
        buckets.map(async (bucket) => {
          try {
            await this.storageAdapter.deleteFiles(bucket, filesToDelete[bucket]);
            await this.filesRepository.deleteManyByS3Key(filesToDelete[bucket]);
            processedCount += filesToDelete[bucket].length;
            return;
          } catch (e) {
            this.logger.error(
              `Failed to delete S3 pending files for bucket ${bucket}: ${e instanceof Error ? e.message : String(e)}`,
            );
            // Если упало, переводим в FAILED_DELETE для повторной попытки
            await this.filesRepository.updateStatusManyByS3Key(
              filesToDelete[bucket],
              FileStatusDomain.FAILED_DELETE,
            );
            return;
          }
        });

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
