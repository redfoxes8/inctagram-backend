import { GenerateUploadUrlRequest, GenerateUploadUrlResponse } from '@inctagram/contracts';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { FileType, PresignedUrlResult } from '../../domain/file.types';
import { FileEntity } from '../../domain/file.entity';
import { IFilesRepository } from '../../domain/interfaces/files.repository.interface';
import { FilesConfig } from '../../../../core/files.config';
import { IStorageAdapter } from '../../infrastructure/interfaces/storage-adapter.interface';

export class GenerateUrlForUploadCommand {
  constructor(
    public dto: GenerateUploadUrlRequest,
    public fileType: FileType,
  ) {}
}

@CommandHandler(GenerateUrlForUploadCommand)
export class GenerateUrlForUploadUseCase implements ICommandHandler<
  GenerateUrlForUploadCommand,
  GenerateUploadUrlResponse
> {
  constructor(
    private awsStorageAdapter: IStorageAdapter,
    private filesRepository: IFilesRepository,
    private config: FilesConfig,
  ) {}

  async execute({
    dto,
    fileType,
  }: GenerateUrlForUploadCommand): Promise<GenerateUploadUrlResponse> {
    const fileEntity: FileEntity = FileEntity.createNew({
      userId: dto.ownerId,
      fileExtension: dto.fileExtension,
      fileType: fileType,
      region: this.config.awsRegion,
    });

    const result: PresignedUrlResult = await this.awsStorageAdapter.generateUploadUrl(
      dto.ownerId,
      fileType,
      dto.fileExtension,
      fileEntity.id,
    );

    fileEntity.setS3Props(result.s3Key, result.bucket);
    await this.filesRepository.save(fileEntity);

    return {
      uploadUrl: result.uploadUrl,
      fileId: fileEntity.id,
      uploadFields: Object.entries(result.uploadFields).map(([name, value]) => ({
        name,
        value: String(value),
      })),
    };
  }
}
