import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
  Delete,
  Param,
  Inject,
} from '@nestjs/common';
import { JwtGuard } from '../../../common/guards/jwt-auth.guard';
import {
  ISessionsQueryRepository,
  SessionViewModel,
} from '../domain/interfaces/sessions.query-repository.interface';
import { CurrentUserInfo } from '../../../../../../libs/common/types/auth.types';
import { CommandBus } from '@nestjs/cqrs';
import { DeactivateOneCommand } from '../application/use-cases/deactivate-one.use-case';
import { DeactivateAllCommand } from '../application/use-cases/deactivate-all.use-case';

@Controller('sessions')
export class SessionsController {
  constructor(
    private sessionsQueryRepo: ISessionsQueryRepository,
    @Inject(CommandBus) private commandBus: CommandBus,
  ) {}

  @Get('my-devices')
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.OK)
  async myDevices(
    @Request() req: Express.Request & { user: CurrentUserInfo },
  ): Promise<SessionViewModel[]> {
    return await this.sessionsQueryRepo.getAllActiveSessions(req.user.userId);
  }

  @Delete('deactivate-one/:deviceId')
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.OK)
  async deactivateOne(
    @Param('deviceId') deviceId: string,
    @Request() req: Express.Request & { user: CurrentUserInfo },
  ) {
    await this.commandBus.execute(
      new DeactivateOneCommand({ deviceId: deviceId, userInfo: req.user }),
    );
    return;
  }

  @Delete('deactivate-all')
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.OK)
  async deactivateAll(@Request() req: Express.Request & { user: CurrentUserInfo }) {
    await this.commandBus.execute(new DeactivateAllCommand(req.user));
    return;
  }
}
