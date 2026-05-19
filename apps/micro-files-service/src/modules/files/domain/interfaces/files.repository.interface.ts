import { FileEntity } from '../file.entity';
import { File, FileStatus } from '../../../../core/prisma/client';

export abstract class IFilesRepository {
  abstract save(file: FileEntity): Promise<void>;

  abstract findPendingOlderThan(date: Date, limit?: number): Promise<File[]>;

  abstract findFailedDeleteFiles(limit?: number): Promise<File[]>;

  abstract delete(id: string): Promise<void>;

  abstract findFileByKey(key: string): Promise<FileEntity | null>;

  abstract deleteMany(ids: string[]): Promise<void>;

  abstract updateStatus(fileEntity: FileEntity): Promise<void>;

  abstract updateStatusMany(ids: string[], status: FileStatus): Promise<void>;

  abstract findByIds(ids: string[]): Promise<File[]>;
}
