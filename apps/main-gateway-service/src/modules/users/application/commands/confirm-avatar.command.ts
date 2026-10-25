import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { randomUUID } from 'crypto';

import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { FileStatus, FileType } from '../../../../../../../libs/contracts/src/generated/file';
import { ITransactionManager } from '../../../../common/interfaces/transaction-manager.interface';
import { FileGrpcClient } from '../../../files/infrastructure/file-grpc.client';
import { ConfirmAvatarResponseDto } from '../../api/rest/dto/confirm-avatar-response.dto';
import { AVATAR_DELETED_EVENT_TYPE } from '../../domain/constants/avatar-outbox.constants';
import { IProfileRepository } from '../../domain/interfaces/user-profile.repository.interface';
import { ProfileEntity } from '../../domain/profile.entity';

type ConfirmAvatarCommandParams = {
  userId: string;
  fileId: string;
};

export class ConfirmAvatarCommand {
  constructor(public readonly params: ConfirmAvatarCommandParams) {}
}

@CommandHandler(ConfirmAvatarCommand)
export class ConfirmAvatarHandler implements ICommandHandler<
  ConfirmAvatarCommand,
  ConfirmAvatarResponseDto
> {
  private readonly logger = new Logger(ConfirmAvatarHandler.name);

  constructor(
    private readonly fileGrpcClient: FileGrpcClient,
    @Inject(IProfileRepository)
    private readonly userProfileRepository: IProfileRepository,
    private readonly transactions: ITransactionManager,
  ) {}

  async execute(command: ConfirmAvatarCommand): Promise<ConfirmAvatarResponseDto> {
    const { userId, fileId } = command.params;

    this.logger.debug(`[ConfirmAvatar] started userId=${userId} fileId=${fileId}`);
    this.logger.debug(`[ConfirmAvatar] validating file fileId=${fileId} userId=${userId}`);

    const fileStatusResponse = await this.fileGrpcClient.getFileStatus({ fileId });
    const file = fileStatusResponse.file;

    if (!file) {
      this.logger.warn(
        `[ConfirmAvatar] validation failed userId=${userId} fileId=${fileId} reason=File not found`,
      );
      throw new DomainException({
        code: DomainExceptionCode.NotFound,
        message: 'File not found',
      });
    }

    if (file.ownerId !== userId) {
      this.logger.warn(
        `[ConfirmAvatar] validation failed userId=${userId} fileId=${fileId} reason=Forbidden ownerId=${file.ownerId}`,
      );
      throw new DomainException({
        code: DomainExceptionCode.Forbidden,
        message: 'Forbidden',
      });
    }

    if (file.fileType !== FileType.AVATAR) {
      this.logger.warn(
        `[ConfirmAvatar] validation failed userId=${userId} fileId=${fileId} reason=Invalid file type fileStatus=${file.status}`,
      );
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Invalid file type',
      });
    }

    if (file.status !== FileStatus.UPLOADED) {
      this.logger.warn(
        `[ConfirmAvatar] validation failed userId=${userId} fileId=${fileId} reason=File is not in UPLOADED status fileStatus=${file.status} ownerId=${file.ownerId}`,
      );
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'File is not in UPLOADED status',
      });
    }

    // File RPC is complete before taking DB locks. Read the current profile under User lock.
    return this.transactions.execute(async (tx) => {
      const profile: ProfileEntity | null = await this.userProfileRepository.lockByUserId({
        userId,
        transaction: tx,
      });
      if (!profile) {
        throw new DomainException({
          code: DomainExceptionCode.NotFound,
          message: 'Profile not found',
        });
      }
      if (profile.avatarFileId === fileId) return { avatarUrl: profile.avatarUrl ?? file.fileUrl };
      const previousFileId = profile.setAvatar(fileId, file.fileUrl);
      await this.userProfileRepository.updateAvatar({
        userId,
        avatarFileId: profile.avatarFileId,
        avatarUrl: profile.avatarUrl,
        updatedAt: profile.updatedAt,
        transaction: tx,
      });
      if (previousFileId !== null) {
        await tx.outboxEvent.create({
          data: {
            type: AVATAR_DELETED_EVENT_TYPE,
            payload: {
              eventId: randomUUID(),
              userId,
              previousAvatarFileId: previousFileId,
              occurredOn: new Date().toISOString(),
            },
            status: 'PENDING',
          },
        });
      }
      return { avatarUrl: profile.avatarUrl! };
    });
  }
}
