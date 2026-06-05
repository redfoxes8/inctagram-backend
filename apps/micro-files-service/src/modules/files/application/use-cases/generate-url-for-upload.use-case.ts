import { GenerateUploadUrlResponse } from '@inctagram/contracts';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PresignedUrlRequest, PresignedUrlResponse } from '../../domain/file.types';
import { FileEntity } from '../../domain/file.entity';
import { IFilesRepository } from '../../domain/interfaces/files.repository.interface';
import { FilesConfig } from '../../../../core/files.config';
import { IStorageAdapter } from '../../infrastructure/interfaces/storage-adapter.interface';
import { GenerateUrlForUploadDto } from './dto/generate-url-for-upload.dto';

export class GenerateUrlForUploadCommand {
  constructor(public dto: GenerateUrlForUploadDto) {}
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

  async execute({ dto }: GenerateUrlForUploadCommand): Promise<GenerateUploadUrlResponse> {
    const fileEntity: FileEntity = FileEntity.createNew({
      userId: dto.ownerId,
      fileExtension: dto.fileExtension,
      fileType: dto.fileType,
      region: this.config.awsRegion,
    });

    const presignedUrlRequest: PresignedUrlRequest = {
      userId: dto.ownerId,
      fileType: dto.fileType,
      fileExtension: dto.fileExtension,
      fileId: fileEntity.id,
    };

    const result: PresignedUrlResponse =
      await this.awsStorageAdapter.generateUploadUrl(presignedUrlRequest);

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
