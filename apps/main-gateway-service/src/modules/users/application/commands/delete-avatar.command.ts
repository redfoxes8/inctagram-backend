import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { randomUUID } from 'crypto';

import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { ITransactionManager } from '../../../../common/interfaces/transaction-manager.interface';
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
    private readonly transactions: ITransactionManager,
  ) {}

  async execute(command: DeleteAvatarCommand): Promise<void> {
    const { userId } = command.params;

    this.logger.debug(`[DeleteAvatar] started userId=${userId}`);

    await this.transactions.execute(async (tx) => {
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
      const previousFileId = profile.removeAvatar();
      if (previousFileId === null) return;
      await this.userProfileRepository.updateAvatar({
        userId,
        avatarFileId: profile.avatarFileId,
        avatarUrl: profile.avatarUrl,
        updatedAt: profile.updatedAt,
        transaction: tx,
      });
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
  }
}
