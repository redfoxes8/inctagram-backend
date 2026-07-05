import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Logger,
  Param,
  Put,
  Request,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { ApiDomainError } from '../../../../../../libs/common/src';
import { GetProfileQuery } from '../application/queries/get-profile.query';
import { GetProfileRequestDto, GetProfileResponseDto } from './dto/get-profile.dto';
import type { IAuthRequestInfo } from '../../../common/interfaces/auth-request-info.interface';
import { UpdateProfileCommand } from '../application/use-cases/update-profile.use-case';
import { UpdateProfileDto } from './dto/update-profile.dto';

const logger = new Logger('ProfileController');

@ApiTags('Profile')
@Controller('profile')
export class ProfileController {
  constructor(
    @Inject(QueryBus) private readonly queryBus: QueryBus,
    @Inject(CommandBus) private readonly commandBus: CommandBus,
  ) {}

  @Get(':userId')
  @ApiOperation({
    summary: 'Get public profile',
    description: 'Retrieves public profile details of a user, along with the posts count.',
  })
  @ApiParam({
    name: 'userId',
    description: 'User identifier',
    example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
  })
  @ApiOkResponse({
    description: 'Public profile retrieved successfully',
    type: GetProfileResponseDto,
  })
  @ApiDomainError(404, 'Profile not found', 'Profile was not found')
  @ApiDomainError(503, 'Service unavailable', 'Service unavailable')
  public async getProfile(
    @Param('userId') dto: GetProfileRequestDto,
  ): Promise<GetProfileResponseDto> {
    logger.debug(`Incoming request: userId=${dto.userId}`);
    return this.queryBus.execute(new GetProfileQuery(dto));
  }

  @Put('update')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Update profile info',
    description: 'Update whole profile info with received data',
  })
  @ApiParam({
    name: 'userId',
    description: 'User identifier',
    example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
  })
  @ApiNoContentResponse({
    description: 'Profile updated successfully',
  })
  @ApiDomainError(401, 'Unauthorized', 'Unauthorized')
  @ApiDomainError(404, 'User profile not found', 'User profile not found')
  @ApiDomainError(400, 'Provided username already taken', 'Username already taken')
  public async updateProfile(
    @Request() req: IAuthRequestInfo,
    @Body() dto: UpdateProfileDto,
  ): Promise<void> {
    const userId: string = req.user.userId;
    logger.debug(`Incoming request: userId=${userId}`);
    await this.commandBus.execute(new UpdateProfileCommand(dto, userId));
    return;
  }
}
