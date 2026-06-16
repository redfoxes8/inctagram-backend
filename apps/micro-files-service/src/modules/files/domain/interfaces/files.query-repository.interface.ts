import { FileEntity } from '../file.entity';

export abstract class IFilesQueryRepository {
  abstract getFilesByIds(ids: string[]): Promise<FileEntity[] | null>;

  abstract findById(id: string): Promise<FileEntity | null>;
}
