import { LogoutDTO } from '../../api/dto/logout.dto';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ISessionsRepository } from '../../../sessions/domain/interfaces/sessions.repository.interface';

export class LogoutCommand {
  constructor(public dto: LogoutDTO) {}
}

@CommandHandler(LogoutCommand)
export class LogoutUseCase implements ICommandHandler<LogoutCommand, void> {
  constructor(private sessionsRepository: ISessionsRepository) {}
  async execute({ dto }: LogoutCommand) {
    await this.sessionsRepository.deleteByDeviceId(dto.deviceId);
    return;
  }
}
