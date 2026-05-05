import { DeactivateOneDTO } from '../../api/dto/deactivate-one.dto';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ISessionsRepository } from '../../domain/interfaces/sessions.repository.interface';
import { SessionEntity } from '../../domain/session.entity';
import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';

export class DeactivateOneCommand {
  constructor(public dto: DeactivateOneDTO) {}
}

@CommandHandler(DeactivateOneCommand)
export class DeactivateOneUseCase implements ICommandHandler<DeactivateOneCommand, void> {
  constructor(private sessionsRepository: ISessionsRepository) {}
  async execute({ dto }: DeactivateOneCommand) {
    const session: SessionEntity | null = await this.sessionsRepository.findByDeviceId(
      dto.deviceId,
    );
    if (!session) {
      throw new DomainException({
        code: DomainExceptionCode.NotFound,
        message: 'Session not found',
      });
    }
    if (session.userId !== dto.userInfo.userId) {
      throw new DomainException({
        code: DomainExceptionCode.Forbidden,
        message: 'You cant deactivate not your session',
      });
    }

    await this.sessionsRepository.deleteByDeviceId(dto.deviceId);
    return;
  }
}
