import { DeactivateOneDTO } from '../../api/dto/deactivate-one.dto';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ISessionsRepository } from '../../domain/interfaces/sessions.repository.interface';

export class DeactivateOneCommand {
  constructor(public dto: DeactivateOneDTO) {}
}

@CommandHandler(DeactivateOneCommand)
export class DeactivateOneUseCase implements ICommandHandler<DeactivateOneCommand, void> {
  constructor(private sessionsRepository: ISessionsRepository) {}
  async execute({ dto }: DeactivateOneCommand) {
    await this.sessionsRepository.deleteByDeviceId(dto.deviceId);
    return;
  }
}
