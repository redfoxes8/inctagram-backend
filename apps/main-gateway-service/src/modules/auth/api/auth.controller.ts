import { randomUUID } from 'crypto';
import {
  Request,
  Body,
  Controller,
  Query,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
  Inject,
} from '@nestjs/common';
import type { Response } from 'express';
import { PasswordRecoveryDto } from './dto/password-recovery.dto';
import { RegisterUserDto } from './dto/register-user.dto';
import { LoginCommand } from '../application/use-cases/login.use-case';
import { PasswordRecoveryCommand } from '../application/use-cases/password-recovery.use-case';
import { RegisterUserCommand } from '../application/use-cases/register-user.use-case';
import { ConfirmEmailCommand } from '../application/use-cases/confirm-email.use-case';
import { SessionInfo } from '../../sessions/api/decorators/session-info.decorator';
import type { SessionMetaData } from '../../sessions/api/decorators/session-info.decorator';
import { CommandBus } from '@nestjs/cqrs';
import { LocalGuard } from '../../../common/guards/local.guard';
import { ChangePasswordDTO } from './dto/change-password.dto';
import { ChangePasswordCommand } from '../application/use-cases/change-password.use-case';
import { JwtGuard } from '../../../common/guards/jwt-auth.guard';
import { LogoutCommand } from '../application/use-cases/logout.use-case';
import { LogoutDTO } from './dto/logout.dto';
import { CurrentUserInfo } from '../../../../../../libs/common/types/auth.types';
import { GoogleLoginDto } from './dto/google-login.dto';
import { GoogleLoginCommand } from '../application/use-cases/google-login.use-case';
import { CoreConfig } from '../../../../../../libs/common/src/core.config';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(CommandBus) private commandBus: CommandBus,
    private coreConfig: CoreConfig,
  ) {}

  @Post('registration')
  @HttpCode(HttpStatus.CREATED)
  public async registration(@Body() dto: RegisterUserDto): Promise<void | { code: string }> {
    const code: string | null = await this.commandBus.execute(new RegisterUserCommand(dto));
    if (this.coreConfig.env == 'test' && code) {
      return { code: code };
    }
    return;
  }

  @Post('confirm-email')
  @HttpCode(HttpStatus.OK)
  public async confirmEmail(@Query('code') code: string, @Res() res: Response): Promise<void> {
    await this.commandBus.execute(new ConfirmEmailCommand({ code: code }));

    const frontend = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const redirectUrl = `${frontend}/auth/sign-in?confirmed=true`;
    res.redirect(302, redirectUrl);
  }

  @Post('login')
  @UseGuards(LocalGuard)
  @HttpCode(HttpStatus.OK)

  public async login(
    @Request() req: Express.Request & { user: CurrentUserInfo },
    @SessionInfo() sessionMeta: SessionMetaData,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    const tokens = await this.commandBus.execute(
      new LoginCommand(req.user, {
        ...sessionMeta,
        deviceId: randomUUID(),
      }),
    );

    res.cookie('refreshToken', tokens.refreshToken, { httpOnly: true, secure: true });
    return { accessToken: tokens.accessToken };
  }

  @Post('password-recovery')
  @HttpCode(HttpStatus.OK)
  public async passwordRecovery(
    @Body() dto: PasswordRecoveryDto,
  ): Promise<void | { code: string | void }> {
    const code: string | void = await this.commandBus.execute(new PasswordRecoveryCommand(dto));
    if (this.coreConfig.env == 'test' && code) {
      return { code: code };
    }
    return;
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)

  public async newPassword(@Body() dto: ChangePasswordDTO): Promise<void> {
    await this.commandBus.execute(new ChangePasswordCommand(dto));
    return;
  }

  @Post('logout')
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.OK)

  public async logout(@Request() req: Express.Request): Promise<void> {
    await this.commandBus.execute(new LogoutCommand(req.user as LogoutDTO));
    return;
  }

  @Post('google/login')
  @HttpCode(HttpStatus.OK)

  public async googleLogin(
    @Body() dto: GoogleLoginDto,
    @SessionInfo() sessionMeta: SessionMetaData,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    const tokens = await this.commandBus.execute(
      new GoogleLoginCommand(
        dto.code,
        dto.username,
        {
          ...sessionMeta,
          deviceId: randomUUID(),
        },
        dto.redirectUri,
      ),
    );

    res.cookie('refreshToken', tokens.refreshToken, { httpOnly: true, secure: true });

    return { accessToken: tokens.accessToken };
  }
}
