import { GenerateUploadUrlRequest, GenerateUploadUrlResponse } from '@inctagram/contracts';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { AwsStorageAdapter } from '../../infrastructure/aws/aws-storage.adapter';
import { FileType, PresignedUrlResult } from '../../domain/file.types';
import { randomUUID } from 'crypto';

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
  constructor(private awsStorageAdapter: AwsStorageAdapter) {}

  async execute({
    dto,
    fileType,
  }: GenerateUrlForUploadCommand): Promise<GenerateUploadUrlResponse> {
    const fileId: string = randomUUID();
    const fileExtension = dto.fileExtension;

    const result: PresignedUrlResult = await this.awsStorageAdapter.generateUploadUrl(
      dto.ownerId,
      fileType,
      fileExtension,
      fileId,
    );
    return {
      uploadUrl: result.uploadUrl,
      fileId: fileId,
      uploadFields: Object.entries(result.uploadFields).map(([name, value]) => ({
        name,
        value: String(value),
      })),
    };
  }
}
