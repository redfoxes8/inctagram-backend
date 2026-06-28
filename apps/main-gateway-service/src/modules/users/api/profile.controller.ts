// /users/profile (получение и редактирование "био", загрузка аватара).

import { Controller, Get, Inject, Logger, Param } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { ApiDomainError } from '../../../../../../libs/common/src';
import { GetPublicProfileQuery } from '../application/queries/get-public-profile.query';
import { PublicProfileResponseDto } from './dto/public-profile-response.dto';

const logger = new Logger('ProfileController');

@ApiTags('Profile')
@Controller('profile')
export class ProfileController {
  constructor(@Inject(QueryBus) private readonly queryBus: QueryBus) {}

  @Get(':userId')
  @ApiOperation({
    summary: 'Get public profile',
    description: 'Retrieves public profile details of a user, along with the posts count.',
  })
  @ApiParam({
    name: 'userId',
    description: 'User identifier',
    example: 'user-id',
  })
  @ApiOkResponse({
    description: 'Public profile retrieved successfully',
    type: PublicProfileResponseDto,
  })
  @ApiDomainError(404, 'User not found', 'User was not found')
  @ApiDomainError(503, 'Service unavailable', 'Service unavailable')
  public async getPublicProfile(@Param('userId') userId: string): Promise<PublicProfileResponseDto> {
    logger.debug(`Incoming request: userId=${userId}`);
    return this.queryBus.execute(new GetPublicProfileQuery(userId));
  }
}
