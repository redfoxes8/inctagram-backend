import { GetFileStatusBatchDto } from '../../api/dto/get-file-status-batch.dto';
import { FileViewType } from '../../domain/file.types';
import { IFilesQueryRepository } from '../../domain/interfaces/files.query-repository.interface';
import { FileEntity } from '../../domain/file.entity';
import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { FileViewTypeMapper } from '../mappers/file-view-type.mapper';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

export class GetFileStatusBatchQuery {
  constructor(public dto: GetFileStatusBatchDto) {}
}

@QueryHandler(GetFileStatusBatchQuery)
export class GetFileStatusBatchHandler implements IQueryHandler<
  GetFileStatusBatchQuery,
  FileViewType[]
> {
  constructor(private readonly fileQueryRepository: IFilesQueryRepository) {}

  async execute({ dto }: GetFileStatusBatchQuery): Promise<FileViewType[]> {
    const result: FileEntity[] | null = await this.fileQueryRepository.getFilesByIds(dto.fileIds);
    if (!result) {
      throw new DomainException({
        code: DomainExceptionCode.NotFound,
        message: 'Files not found',
      });
    }

    return FileViewTypeMapper.toViewTypeMany(result);
  }
}
