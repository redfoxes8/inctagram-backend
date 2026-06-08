import { GetFilesDataDto } from '../../api/dto/get-files-data.dto';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { FileEntity } from '../../domain/file.entity';
import { IFilesQueryRepository } from '../../domain/interfaces/files.query-repository.interface';

export class GetFilesDataQuery {
  constructor(public dto: GetFilesDataDto) {}
}

@QueryHandler(GetFilesDataQuery)
export class GetFilesDataHandler implements IQueryHandler<GetFilesDataQuery, FileEntity[]> {
  constructor(private readonly queryRepository: IFilesQueryRepository) {}
  async execute({ dto }: GetFilesDataQuery): Promise<FileEntity[]> {
    return await this.queryRepository.getFilesByIds(dto.fileIds);
  }
}
