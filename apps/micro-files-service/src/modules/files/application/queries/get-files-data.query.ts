import { GetFilesDataDto } from '../../api/dto/get-files-data.dto';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { FilesQueryRepository } from '../../infrastructure/repositories/files.query-repository';
import { FileEntity } from '../../domain/file.entity';
import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';

export class GetFilesDataQuery {
  constructor(public dto: GetFilesDataDto) {}
}

@QueryHandler(GetFilesDataQuery)
export class GetFilesDataHandler implements IQueryHandler<GetFilesDataQuery, FileEntity[]> {
  constructor(private readonly queryRepository: FilesQueryRepository) {}
  async execute({ dto }: GetFilesDataQuery): Promise<FileEntity[]> {
    const files: FileEntity[] | null = await this.queryRepository.getFilesByIds(dto.fileIds);
    if (!files) {
      throw new DomainException({
        message: 'Files not found',
        code: DomainExceptionCode.NotFound,
      });
    }
    return files;
  }
}
