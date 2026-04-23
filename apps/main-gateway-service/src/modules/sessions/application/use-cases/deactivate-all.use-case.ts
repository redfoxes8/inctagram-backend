import { DeactivateAllDTO } from '../../api/dto/deactivate-all.dto';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ISessionsRepository } from '../../domain/interfaces/sessions.repository.interface';

export class DeactivateAllCommand {
  constructor(public dto: DeactivateAllDTO) {}
}

@CommandHandler(DeactivateAllCommand)
export class DeactivateAllUseCase implements ICommandHandler<DeactivateAllCommand, void> {
  constructor(private sessionsRepository: ISessionsRepository) {}
  async execute({ dto }: DeactivateAllCommand) {
    await this.sessionsRepository.deleteAllOtherSessions(dto.userId, dto.deviceId);
    return;
  }
}
