import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { randomUUID } from 'crypto';

import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { AVATAR_DELETED_EVENT_TYPE } from '../../domain/constants/avatar-outbox.constants';
import { IProfileRepository } from '../../domain/interfaces/user-profile.repository.interface';
import { ProfileEntity } from '../../domain/profile.entity';

type DeleteAvatarCommandParams = {
  userId: string;
};

export class DeleteAvatarCommand {
  constructor(public readonly params: DeleteAvatarCommandParams) {}
}

@CommandHandler(DeleteAvatarCommand)
export class DeleteAvatarHandler implements ICommandHandler<DeleteAvatarCommand, void> {
  private readonly logger = new Logger(DeleteAvatarHandler.name);

  constructor(
    @Inject(IProfileRepository)
    private readonly userProfileRepository: IProfileRepository,
    private readonly prismaService: PrismaService,
  ) {}

  async execute(command: DeleteAvatarCommand): Promise<void> {
    const { userId } = command.params;

    this.logger.debug(`[DeleteAvatar] started userId=${userId}`);

    const profile: ProfileEntity | null = await this.userProfileRepository.findByUserId(userId);

    if (!profile) {
      this.logger.warn(`[DeleteAvatar] profile not found userId=${userId}`);
      throw new DomainException({
        code: DomainExceptionCode.NotFound,
        message: 'Profile not found',
      });
    }

    const previousFileId = profile.removeAvatar();

    if (previousFileId === null) {
      this.logger.log(`[DeleteAvatar] profile avatar is already deleted or not set userId=${userId}`);
      return;
    }

    this.logger.debug(
      `[DeleteAvatar] transaction started userId=${userId} previousFileId=${previousFileId}`,
    );

    await this.prismaService.$transaction(async (tx) => {
      await this.userProfileRepository.save(profile, tx);

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
    });

    this.logger.log(
      `[DeleteAvatar] transaction committed userId=${userId} previousFileId=${previousFileId}`,
    );
  }
}
