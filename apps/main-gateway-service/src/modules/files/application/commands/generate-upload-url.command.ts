import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { GenerateUploadUrlDto } from '../../api/dto/generate-upload-url.dto';
import { GenerateUploadUrlResponseDto } from '../../api/dto/generate-upload-url-response.dto';
import { FileRequestMapper } from '../../api/mappers/file-request.mapper';
import { FileResponseMapper } from '../../api/mappers/file-response.mapper';
import { FileGrpcClient } from '../../infrastructure/file-grpc.client';

type GenerateUploadUrlCommandParams = {
  dto: GenerateUploadUrlDto;
  ownerId: string;
};

export class GenerateUploadUrlCommand {
  constructor(public readonly params: GenerateUploadUrlCommandParams) {}
}

@CommandHandler(GenerateUploadUrlCommand)
export class GenerateUploadUrlHandler implements ICommandHandler<
  GenerateUploadUrlCommand,
  GenerateUploadUrlResponseDto
> {
  constructor(private readonly fileGrpcClient: FileGrpcClient) {}

  async execute(command: GenerateUploadUrlCommand): Promise<GenerateUploadUrlResponseDto> {
    const request = FileRequestMapper.toGenerateUploadUrlRequest(command.params);
    const response = await this.fileGrpcClient.generateUploadUrl(request);

    return FileResponseMapper.toGenerateUploadUrlResponse(response);
  }
}
