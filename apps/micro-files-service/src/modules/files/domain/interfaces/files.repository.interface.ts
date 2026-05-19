import { File } from '../../../../core/prisma/client';
import { FileEntity } from '../file.entity';

export abstract class IFilesRepository {
  abstract save(file: FileEntity): Promise<void>;

  abstract findPendingOlderThan(date: Date): Promise<File[]>;

  abstract delete(id: string): Promise<void>;

  abstract findFileByKey(key: string): Promise<FileEntity | null>;
}
