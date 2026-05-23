import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { ApiDomainError } from '../../../../../../libs/common/src';
import { JwtGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUserId } from '../../auth/api/decorators/current-user-id.decorator';
import { CheckUsernameQuery } from '../application/queries/check-username.query';
import { GetMeQuery } from '../application/queries/get-me.query';
import { UserMeResponseDto } from './dto/user-me-response.dto';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(@Inject(QueryBus) private readonly queryBus: QueryBus) {}

  @Get('me')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiOkResponse({ description: 'Current user profile', type: UserMeResponseDto })
  @ApiDomainError(401, 'Unauthorized', 'Unauthorized')
  @ApiDomainError(404, 'User not found', 'User was not found')
  public async getMe(@CurrentUserId() userId: string): Promise<UserMeResponseDto> {
    return this.queryBus.execute(new GetMeQuery(userId));
  }

  @Get('check-username')
  @ApiOperation({
    summary: 'Check if username is available',
    description: 'Checks whether the provided username is already taken by another user.',
  })
  @ApiQuery({
    name: 'username',
    description: 'The username to check',
    example: 'cool_user',
    required: true,
  })
  @ApiOkResponse({
    description: 'Username availability status',
    schema: {
      example: { available: true },
      properties: { available: { type: 'boolean' } },
    },
  })
  @ApiDomainError(400, 'Validation error', 'Validation failed', [
    { message: 'Invalid username format', field: 'username' },
  ])
  public async checkUsername(@Query('username') username: string): Promise<{ available: boolean }> {
    return this.queryBus.execute(new CheckUsernameQuery(username));
  }
}
