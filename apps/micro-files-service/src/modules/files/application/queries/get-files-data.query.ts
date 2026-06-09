import { GetFilesDataDto } from '../../api/dto/get-files-data.dto';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { FileEntity } from '../../domain/file.entity';
import { IFilesQueryRepository } from '../../domain/interfaces/files.query-repository.interface';
import { Logger } from '@nestjs/common';

export class GetFilesDataQuery {
  constructor(public dto: GetFilesDataDto) {}
}

@QueryHandler(GetFilesDataQuery)
export class GetFilesDataHandler implements IQueryHandler<GetFilesDataQuery, FileEntity[] | null> {
  private readonly logger = new Logger(GetFilesDataHandler.name);
  constructor(private readonly queryRepository: IFilesQueryRepository) {}
  async execute({ dto }: GetFilesDataQuery): Promise<FileEntity[] | null> {
    const files: FileEntity[] | null = await this.queryRepository.getFilesByIds(dto.fileIds);
    if (!files) {
      this.logger.warn(`Files not found: ${dto.fileIds.join(', ')}`);
      return [];
    }
    return files;
  }
}
