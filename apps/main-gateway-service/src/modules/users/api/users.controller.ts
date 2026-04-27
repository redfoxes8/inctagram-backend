import { Controller, Get, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CheckUsernameQuery } from '../application/queries/check-username.query';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('check-username')
  @ApiOperation({ summary: 'Check if username is available' })
  @ApiResponse({
    status: 200,
    description: 'Returns availability status',
    schema: {
      type: 'object',
      properties: {
        available: { type: 'boolean' },
      },
    },
  })
  public async checkUsername(@Query('username') username: string): Promise<{ available: boolean }> {
    return this.queryBus.execute(new CheckUsernameQuery(username));
  }
}
