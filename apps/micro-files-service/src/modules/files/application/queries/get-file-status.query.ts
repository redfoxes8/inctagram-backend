import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { IFilesQueryRepository } from '../../domain/interfaces/files.query-repository.interface';
import { FileEntity } from '../../domain/file.entity';
import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { GetFileStatusDto } from '../../api/dto/get-file-status.dto';
import { FileViewTypeMapper } from '../mappers/file-view-type.mapper';

export class GetFileStatusQuery {
  constructor(public readonly dto: GetFileStatusDto) {}
}

@QueryHandler(GetFileStatusQuery)
export class GetFileStatusHandler implements IQueryHandler<GetFileStatusQuery, FileViewTypeMapper> {
  constructor(private readonly fileQueryRepository: IFilesQueryRepository) {}

  async execute({ dto }: GetFileStatusQuery): Promise<FileViewTypeMapper> {
    const result: FileEntity | null = await this.fileQueryRepository.findById(dto.fileId);
    if (!result) {
      throw new DomainException({
        message: `File with id ${dto.fileId} not found`,
        code: DomainExceptionCode.NotFound,
      });
    }
    return FileViewTypeMapper.toViewType(result);
  }
}
