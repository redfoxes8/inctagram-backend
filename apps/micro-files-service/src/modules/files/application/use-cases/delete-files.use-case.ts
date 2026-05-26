import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { IFilesRepository } from '../../domain/interfaces/files.repository.interface';
import { IStorageAdapter } from '../../infrastructure/interfaces/storage-adapter.interface';
import { PostDeletedMessageDto } from '../../api/dto/post-deleted-message.dto';
import { DomainException, DomainExceptionCode } from '../../../../../../../libs/common/src';
import { FileStatusDomain } from '../../domain/file.types';
import { FileEntity } from '../../domain/file.entity';

export class DeleteFilesCommand {
  constructor(public readonly dto: PostDeletedMessageDto) {}
}

@CommandHandler(DeleteFilesCommand)
export class DeleteFilesUseCase implements ICommandHandler<DeleteFilesCommand, void> {
  constructor(
    private readonly filesRepository: IFilesRepository,
    private readonly storageAdapter: IStorageAdapter,
  ) {}

  async execute({ dto }: DeleteFilesCommand): Promise<void> {
    if (!dto.fileIds) {
      throw new DomainException({
        message: '[POST_DELETED_MESSAGE] fileIds property is required',
        code: DomainExceptionCode.BadRequest,
      });
    }
    if (dto.fileIds.length == 0) {
      return;
    }

    const files: FileEntity[] | null = await this.filesRepository.findByIds(dto.fileIds);
    if (!files) return;

    const idsToUpdate: string[] = files.map((f) => f.id);

    await this.filesRepository.updateStatusMany(idsToUpdate, FileStatusDomain.DELETING);

    const filesToDelete: Record<string, string[]> = files.reduce(
      (acc, file) => {
        const bucket: string = file.getBucket();
        acc[bucket] = acc[bucket] || [];
        acc[bucket].push(file.getS3Key());
        return acc;
      },
      {} as Record<string, string[]>,
    );

    const buckets: string[] = Object.keys(filesToDelete);
    const deletionPromises: Promise<void>[] = buckets.map(async (bucket) => {
      try {
        await this.storageAdapter.deleteFiles(bucket, filesToDelete[bucket]);
        await this.filesRepository.deleteManyByS3Key(filesToDelete[bucket]);
      } catch (error) {
        console.error(`[DeleteFilesUseCase] Failed to delete S3 files:`, error);
        await this.filesRepository.updateStatusMany(idsToUpdate, FileStatusDomain.FAILED_DELETE);
        throw new DomainException({
          message: '[DeleteFilesUseCase] Failed to delete S3 files',
          code: DomainExceptionCode.ServiceUnavailable,
        });
      }
    });
    await Promise.allSettled(deletionPromises);
    return;
  }
}
