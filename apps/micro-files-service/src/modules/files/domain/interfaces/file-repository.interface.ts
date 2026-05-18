export interface IFileRepository {
  findFileByKey(key: string): Promise<void>;
}
