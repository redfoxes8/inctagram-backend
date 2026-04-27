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
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private commandBus: CommandBus) {}

  @Post('registration')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User successfully registered' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  public async registration(@Body() dto: RegisterUserDto): Promise<void> {
    await this.commandBus.execute(new RegisterUserCommand(dto));
  }

  @Post('confirm-email')
  @ApiOperation({ summary: 'Confirm email via code' })
  @ApiResponse({ status: 302, description: 'Redirects to frontend with confirmation status' })
  public async confirmEmail(@Query('code') code: string, @Res() res: Response): Promise<void> {
    await this.commandBus.execute(new ConfirmEmailCommand({ code: code }));

    const frontend = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const redirectUrl = `${frontend}/auth/sign-in?confirmed=true`;
    res.redirect(302, redirectUrl);
  }

  @Post('login')
  @UseGuards(LocalGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email/username and password' })
  @ApiResponse({ status: 200, description: 'Returns AccessToken and sets RefreshToken in cookies' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized. May return message "Please login using your OAuth provider (Google)" if user has no password.',
  })
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
  @ApiOperation({ summary: 'Request password recovery' })
  @ApiResponse({ status: 200, description: 'Recovery email sent (if user exists)' })
  public async passwordRecovery(@Body() dto: PasswordRecoveryDto): Promise<void> {
    await this.commandBus.execute(new PasswordRecoveryCommand(dto));
    return;
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change password using recovery code' })
  @ApiResponse({ status: 200, description: 'Password successfully changed' })
  @ApiResponse({ status: 400, description: 'Invalid or expired recovery code' })
  public async newPassword(@Body() dto: ChangePasswordDTO): Promise<void> {
    await this.commandBus.execute(new ChangePasswordCommand(dto));
    return;
  }

  @Post('logout')
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout user and clear session' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  public async logout(@Request() req: Express.Request): Promise<void> {
    await this.commandBus.execute(new LogoutCommand(req.user as LogoutDTO));
    return;
  }

  @Post('google/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login via Google OAuth2' })
  @ApiResponse({ status: 200, description: 'Successful login, returns AccessToken' })
  @ApiResponse({ status: 401, description: 'Invalid Google code or email not verified' })
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
