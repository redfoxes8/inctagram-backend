import { Controller, Get, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { CheckUsernameQuery } from '../application/queries/check-username.query';

@Controller('users')
export class UsersController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('check-username')
  public async checkUsername(@Query('username') username: string): Promise<{ available: boolean }> {
    return this.queryBus.execute(new CheckUsernameQuery(username));
  }
}
