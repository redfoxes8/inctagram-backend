import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { randomUUID } from 'crypto';

import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { FileStatus, FileType } from '../../../../../../../libs/contracts/src/generated/file';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { FileGrpcClient } from '../../../files/infrastructure/file-grpc.client';
import { ConfirmAvatarResponseDto } from '../../api/dto/confirm-avatar-response.dto';
import { AVATAR_DELETED_EVENT_TYPE } from '../../domain/constants/avatar-outbox.constants';
import { IUserProfileRepository } from '../../domain/interfaces/user-profile.repository.interface';
import { UserProfileEntity } from '../../domain/user-profile.entity';

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
    @Inject(IUserProfileRepository)
    private readonly userProfileRepository: IUserProfileRepository,
    private readonly prismaService: PrismaService,
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

    let profile = await this.userProfileRepository.findByUserId(userId);

    if (profile === null) {
      profile = new UserProfileEntity({
        id: randomUUID(),
        userId,
        firstName: null,
        lastName: null,
        dateOfBirth: null,
        country: null,
        city: null,
        aboutMe: null,
        avatarFileId: null,
        avatarUrl: null,
      });
    }

    if (profile.avatarFileId === command.params.fileId) {
      return { avatarUrl: profile.avatarUrl ?? file.fileUrl };
    }

    const previousFileId = profile.setAvatar(command.params.fileId, file.fileUrl);

    this.logger.debug(`[ConfirmAvatar] transaction started userId=${userId} fileId=${fileId}`);

    if (previousFileId !== null) {
      this.logger.debug(
        `[ConfirmAvatar] previous avatar detected userId=${userId} previousFileId=${previousFileId}`,
      );
    }

    let eventCreated = false;
    let outboxEventId: string | null = null;

    await this.prismaService.$transaction(async (tx) => {
      await this.userProfileRepository.upsert(profile, tx);

      this.logger.debug(
        `[ConfirmAvatar] userProfile updated userId=${userId} avatarFileId=${profile.avatarFileId} avatarUrl=${profile.avatarUrl}`,
      );

      if (previousFileId !== null) {
        outboxEventId = randomUUID();
        await tx.outboxEvent.create({
          data: {
            type: AVATAR_DELETED_EVENT_TYPE,
            payload: {
              eventId: outboxEventId,
              userId,
              previousAvatarFileId: previousFileId,
              occurredOn: new Date().toISOString(),
            },
            status: 'PENDING',
          },
        });
        eventCreated = true;
        this.logger.log(
          `[ConfirmAvatar] outbox event created userId=${userId} previousFileId=${previousFileId} eventId=${outboxEventId} eventType=${AVATAR_DELETED_EVENT_TYPE}`,
        );
      }
    });

    this.logger.log(
      `[ConfirmAvatar] transaction committed userId=${userId} fileId=${fileId} eventCreated=${eventCreated}`,
    );

    return { avatarUrl: profile.avatarUrl! };
  }
}
