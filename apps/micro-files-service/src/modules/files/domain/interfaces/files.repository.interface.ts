import { File, FileStatus } from '../../../../core/prisma/client';
import { FileType } from '../file.types';

export abstract class IFilesRepository {
  abstract create(data: {
    s3Key: string;
    bucket: string;
    fileType: FileType;
    userId: string;
  }): Promise<File>;

  abstract findPendingOlderThan(date: Date, limit?: number): Promise<File[]>;

  abstract findFailedDeleteFiles(limit?: number): Promise<File[]>;

  abstract delete(id: string): Promise<void>;

  abstract deleteMany(ids: string[]): Promise<void>;

  abstract updateStatus(id: string, status: FileStatus): Promise<void>;

  abstract updateStatusMany(ids: string[], status: FileStatus): Promise<void>;

  abstract findFileByKey(key: string): Promise<File | null>;

  abstract findByIds(ids: string[]): Promise<File[]>;
}
