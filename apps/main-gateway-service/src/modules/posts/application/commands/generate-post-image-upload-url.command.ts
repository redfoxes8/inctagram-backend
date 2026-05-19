import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { GeneratePostImageUploadUrlDto } from '../../api/dto/generate-post-image-upload-url.dto';
import { GeneratePostImageUploadUrlResponseDto } from '../../api/dto/generate-post-image-upload-url-response.dto';
import { PostImageRequestMapper } from '../../api/mappers/post-image-request.mapper';
// We need to import FileGrpcClient and FileResponseMapper. They are currently in files module, 
// let's assume we can import them from there for now.
import { FileGrpcClient } from '../../../files/infrastructure/file-grpc.client';
import { FileResponseMapper } from '../../../files/api/mappers/file-response.mapper';

type GeneratePostImageUploadUrlCommandParams = {
  dto: GeneratePostImageUploadUrlDto;
  ownerId: string;
};

export class GeneratePostImageUploadUrlCommand {
  constructor(public readonly params: GeneratePostImageUploadUrlCommandParams) {}
}

@CommandHandler(GeneratePostImageUploadUrlCommand)
export class GeneratePostImageUploadUrlHandler implements ICommandHandler<
  GeneratePostImageUploadUrlCommand,
  GeneratePostImageUploadUrlResponseDto
> {
  constructor(private readonly fileGrpcClient: FileGrpcClient) {}

  async execute(command: GeneratePostImageUploadUrlCommand): Promise<GeneratePostImageUploadUrlResponseDto> {
    const request = PostImageRequestMapper.toGenerateUploadUrlRequest(command.params);
    const response = await this.fileGrpcClient.generateUploadUrl(request);

    // Reuse the generic response mapper
    return FileResponseMapper.toGenerateUploadUrlResponse(response) as GeneratePostImageUploadUrlResponseDto;
  }
}
