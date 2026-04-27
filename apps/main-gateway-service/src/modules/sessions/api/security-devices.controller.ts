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
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { ApiDomainError } from '../../../../../../libs/common/src';

@ApiTags('Sessions')
@Controller('sessions')
export class SessionsController {
  constructor(
    private sessionsQueryRepo: ISessionsQueryRepository,
    @Inject(CommandBus) private commandBus: CommandBus,
  ) {}

  @Get('my-devices')
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all active sessions', description: 'Returns a list of all active sessions for the current user.' })
  @ApiOkResponse({ description: 'List of active sessions', type: [SessionViewModel] })
  @ApiDomainError(401, 'Unauthorized', 'Unauthorized')
  async myDevices(
    @Request() req: Express.Request & { user: CurrentUserInfo },
  ): Promise<SessionViewModel[]> {
    return await this.sessionsQueryRepo.getAllActiveSessions(req.user.userId);
  }

  @Delete('deactivate-one/:deviceId')
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deactivate a session', description: 'Deactivate a specific session by its device ID.' })
  @ApiParam({ name: 'deviceId', description: 'The unique identifier of the device/session', example: '123e4567-e89b-12d3-a456-426614174000' })
  @ApiOkResponse({ description: 'Session successfully deactivated' })
  @ApiDomainError(401, 'Unauthorized', 'Unauthorized')
  @ApiDomainError(403, 'Forbidden to delete another user session', 'Forbidden')
  @ApiDomainError(404, 'Session not found', 'Not Found', [{ message: 'Session with this ID does not exist', field: 'deviceId' }])
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
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deactivate all other sessions', description: 'Terminates all active sessions for the current user, except for the current session.' })
  @ApiOkResponse({ description: 'All other sessions successfully deactivated' })
  @ApiDomainError(401, 'Unauthorized', 'Unauthorized')
  async deactivateAll(@Request() req: Express.Request & { user: CurrentUserInfo }) {
    await this.commandBus.execute(new DeactivateAllCommand(req.user));
    return;
  }
}
