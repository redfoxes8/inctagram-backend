import { Controller, Get, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { CheckUsernameQuery } from '../application/queries/check-username.query';
import { ApiTags, ApiOperation, ApiQuery, ApiOkResponse } from '@nestjs/swagger';
import { ApiDomainError } from '../../../../../../libs/common/src';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('check-username')
  @ApiOperation({ summary: 'Check if username is available', description: 'Checks whether the provided username is already taken by another user.' })
  @ApiQuery({ name: 'username', description: 'The username to check', example: 'cool_user', required: true })
  @ApiOkResponse({ 
    description: 'Username availability status', 
    schema: { 
      example: { available: true },
      properties: { available: { type: 'boolean' } }
    } 
  })
  @ApiDomainError(400, 'Validation error', 'Validation failed', [{ message: 'Invalid username format', field: 'username' }])
  public async checkUsername(@Query('username') username: string): Promise<{ available: boolean }> {
    return this.queryBus.execute(new CheckUsernameQuery(username));
  }
}
