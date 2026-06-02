import { FileEntity } from '../file.entity';
import { FileStatusDomain } from '../file.types';

export abstract class IFilesRepository {
  abstract save(file: FileEntity): Promise<void>;

  abstract findPendingOlderThan(date: Date, limit?: number): Promise<FileEntity[]>;

  abstract findFailedDeleteFiles(limit?: number): Promise<FileEntity[]>;

  abstract deleteById(id: string): Promise<void>;

  abstract findFileByKey(key: string): Promise<FileEntity | null>;

  abstract deleteManyById(ids: string[]): Promise<void>;

  abstract deleteManyByS3Key(s3Keys: string[]): Promise<void>;

  abstract updateStatus(fileId: string, fileStatus: FileStatusDomain): Promise<void>;

  abstract updateStatusMany(ids: string[], status: FileStatusDomain): Promise<void>;

  abstract updateStatusManyByS3Key(s3Keys: string[], status: FileStatusDomain): Promise<void>;

  abstract findByIds(ids: string[]): Promise<FileEntity[] | null>;
}
