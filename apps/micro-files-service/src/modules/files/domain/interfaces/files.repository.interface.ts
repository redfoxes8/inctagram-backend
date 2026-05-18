import { File } from '../../../../core/prisma/client';
import { FileType } from '../file.types';

export abstract class IFilesRepository {
  abstract create(data: {
    s3Key: string;
    bucket: string;
    fileType: FileType;
    userId: string;
  }): Promise<File>;

  abstract findPendingOlderThan(date: Date): Promise<File[]>;

  abstract delete(id: string): Promise<void>;

  abstract updateStatus(id: string, status: string): Promise<void>;

  abstract findFileByKey(key: string): Promise<File>;
}
