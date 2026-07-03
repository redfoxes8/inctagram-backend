import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { FileType } from '../../../../../../../libs/contracts/src/generated/file';
import { FileGrpcClient } from '../../../files/infrastructure/file-grpc.client';
import { GetAvatarUploadUrlResponseDto } from '../../api/dto/get-avatar-upload-url-response.dto';

type GetAvatarUploadUrlCommandParams = {
  userId: string;
  fileSize: number;
  fileExtension: string;
};

export class GetAvatarUploadUrlCommand {
  constructor(public readonly params: GetAvatarUploadUrlCommandParams) {}
}

@CommandHandler(GetAvatarUploadUrlCommand)
export class GetAvatarUploadUrlHandler implements ICommandHandler<
  GetAvatarUploadUrlCommand,
  GetAvatarUploadUrlResponseDto
> {
  private readonly logger = new Logger(GetAvatarUploadUrlHandler.name);

  constructor(private readonly fileGrpcClient: FileGrpcClient) {}

  async execute(command: GetAvatarUploadUrlCommand): Promise<GetAvatarUploadUrlResponseDto> {
    const { userId, fileSize, fileExtension } = command.params;

    this.logger.debug(
      `[GetAvatarUploadUrl] started userId=${userId} fileSize=${fileSize} fileExtension=${fileExtension}`,
    );

    this.logger.debug(
      `[GetAvatarUploadUrl] calling FileGrpcClient.generateUploadUrl userId=${userId} fileType=${FileType.AVATAR} fileSize=${fileSize} fileExtension=${fileExtension}`,
    );

    const response = await this.fileGrpcClient.generateUploadUrl({
      ownerId: userId,
      fileType: FileType.AVATAR,
      fileSize,
      fileExtension,
    });

    this.logger.debug(
      `[GetAvatarUploadUrl] received fileId=${response.fileId} userId=${userId} uploadFieldsCount=${response.uploadFields.length}`,
    );

    this.logger.debug(
      `[GetAvatarUploadUrl] completed userId=${userId} fileId=${response.fileId} uploadUrl=${response.uploadUrl}`,
    );

    return {
      uploadUrl: response.uploadUrl,
      fileId: response.fileId,
      uploadFields: response.uploadFields.map((field) => ({
        name: field.name,
        value: field.value,
      })),
    };
  }
}
