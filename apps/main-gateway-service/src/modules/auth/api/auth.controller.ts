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
  Get,
  UnauthorizedException,
} from '@nestjs/common';
import type { CookieOptions, Request as ExpressRequest, Response } from 'express';
import { PasswordRecoveryDto } from './dto/password-recovery.dto';
import { RegisterUserDto } from './dto/register-user.dto';
import { LoginCommand } from '../application/use-cases/login.use-case';
import { RefreshTokenCommand } from '../application/use-cases/refresh-token.use-case';
import type { AuthTokens } from '../application/interfaces/jwt.service.interface';
import { PasswordRecoveryCommand } from '../application/use-cases/password-recovery.use-case';
import { RegisterUserCommand } from '../application/use-cases/register-user.use-case';
import { ConfirmEmailCommand } from '../application/use-cases/confirm-email.use-case';
import { SessionInfo } from '../../sessions/api/decorators/session-info.decorator';
import type { SessionMetaData } from '../../sessions/api/decorators/session-info.decorator';
import { CommandBus } from '@nestjs/cqrs';
import { LocalGuard } from '../../../common/guards/local.guard';
import { LoginDTO } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { ChangePasswordDTO } from './dto/change-password.dto';
import { ChangePasswordCommand } from '../application/use-cases/change-password.use-case';
import { JwtGuard } from '../../../common/guards/jwt-auth.guard';
import { LogoutCommand } from '../application/use-cases/logout.use-case';
import { LogoutDTO } from './dto/logout.dto';
import { CurrentUserInfo } from '../../../../../../libs/common/types/auth.types';
import { GoogleLoginDto } from './dto/google-login.dto';
import { GoogleLoginCommand } from '../application/use-cases/google-login.use-case';
import { AuthEmailResendConfirmationCommand } from '../application/use-cases/auth-email-resend-confirmation.usecase';
import { EmailResendDto } from './dto/email-resend.dto';
import { CoreConfig } from '../../../../../../libs/common/src/core.config';
import { GatewayConfig } from '../../../core/gateway.config';
import { Recaptcha } from '@nestlab/google-recaptcha';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiResponse,
} from '@nestjs/swagger';
import { ApiDomainError } from '../../../../../../libs/common/src';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(CommandBus) private commandBus: CommandBus,
    private coreConfig: CoreConfig,
    private gatewayConfig: GatewayConfig,
  ) {}

  @Post('registration')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registration', description: 'Register a new user.' })
  @ApiCreatedResponse({ description: 'Registration successful' })
  @ApiDomainError(400, 'Validation error', 'Validation failed', [
    { message: 'Email must be a valid email address', field: 'email' },
  ])
  public async registration(@Body() dto: RegisterUserDto): Promise<void | { code: string }> {
    const code: string | null = await this.commandBus.execute(new RegisterUserCommand(dto));
    if (this.coreConfig.env == 'test' && code) {
      return { code: code };
    }
    return;
  }

  @Post('registration-email-resending')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Resend registration confirmation email' })
  @ApiBody({ type: EmailResendDto })
  @ApiOkResponse({ description: 'Confirmation email resent' })
  @ApiDomainError(400, 'Validation error', 'Validation failed', [
    { message: 'User not found', field: 'email' },
    { message: 'Email already confirmed', field: 'email' },
    { message: 'The confirmation code is still valid', field: 'email' },
  ])
  public async registrationEmailResending(
    @Body() dto: EmailResendDto,
  ): Promise<void | { code: string }> {
    const code: string | void = await this.commandBus.execute(
      new AuthEmailResendConfirmationCommand(dto),
    );
    if (this.coreConfig.env == 'test' && code) {
      return { code: code };
    }
    return;
  }

  @Post('confirm-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm email',
    description: 'Confirm user email using the code sent via email.',
  })
  @ApiOkResponse({ description: 'Email confirmed successfully' })
  @ApiDomainError(400, 'Invalid or expired code', 'Invalid code', [
    { message: 'Code has expired', field: 'code' },
  ])
  public async confirmEmail(@Query('code') code: string, @Res() res: Response): Promise<void> {
    await this.commandBus.execute(new ConfirmEmailCommand({ code: code }));

    const frontend = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const redirectUrl = `${frontend}/auth/sign-in?confirmed=true`;
    res.redirect(302, redirectUrl);
  }

  @Post('login')
  @UseGuards(LocalGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login',
    description:
      'Login with username/email and password. Returns an access token and sets a refresh token in cookies.',
  })
  @ApiBody({ type: LoginDTO })
  @ApiOkResponse({
    description: 'Login successful',
    type: LoginResponseDto,
  })
  @ApiDomainError(401, 'Invalid credentials or OAuth provider required', 'Unauthorized')
  public async login(
    @Request() req: Express.Request & { user: CurrentUserInfo },
    @SessionInfo() sessionMeta: SessionMetaData,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const tokens: AuthTokens = await this.commandBus.execute(
      new LoginCommand(req.user, {
        ...sessionMeta,
        deviceId: randomUUID(),
      }),
    );

    this.setRefreshTokenCookie(res, tokens.refreshToken);

    return { accessToken: tokens.accessToken };
  }

  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('refreshToken')
  @ApiOperation({
    summary: 'Refresh access and refresh tokens',
    description: 'Uses a valid refresh token from cookies to generate a new token pair.',
  })
  @ApiOkResponse({
    description: 'Tokens successfully refreshed',
    type: LoginResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized: Invalid token, session not found, or token reuse detected',
  })
  public async refreshToken(
    @Request() req: ExpressRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const refreshToken: string = req.cookies?.refreshToken;
    if (!refreshToken) throw new UnauthorizedException();

    const tokens: AuthTokens = await this.commandBus.execute(new RefreshTokenCommand(refreshToken));

    this.setRefreshTokenCookie(res, tokens.refreshToken, {
      maxAge: this.gatewayConfig.refreshTokenExpTime * 1000,
    });

    return { accessToken: tokens.accessToken };
  }

  @Post('password-recovery')
  @Recaptcha()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Password recovery', description: 'Request a password recovery email.' })
  @ApiHeader({ name: 'recaptcha', description: 'Google reCAPTCHA token', required: true })
  @ApiOkResponse({ description: 'Recovery email sent' })
  @ApiDomainError(400, 'Validation error', 'Validation failed', [
    { message: 'Email must be a valid email address', field: 'email' },
  ])
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
  @ApiOperation({
    summary: 'Change password',
    description: 'Change password using the recovery code.',
  })
  @ApiOkResponse({ description: 'Password changed successfully' })
  @ApiDomainError(400, 'Invalid code or passwords do not match', 'Invalid code', [
    { message: 'Code is invalid or has expired', field: 'recoveryCode' },
  ])
  public async newPassword(@Body() dto: ChangePasswordDTO): Promise<void> {
    await this.commandBus.execute(new ChangePasswordCommand(dto));
    return;
  }

  @Post('logout')
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout', description: 'Logout the user and clear the session.' })
  @ApiOkResponse({ description: 'Logout successful' })
  @ApiDomainError(401, 'Unauthorized', 'Unauthorized')
  public async logout(@Request() req: Express.Request): Promise<void> {
    await this.commandBus.execute(new LogoutCommand(req.user as LogoutDTO));
    return;
  }

  @Get('google/client-id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get Google Client ID',
    description: 'Returns the Google Client ID for frontend OAuth initialization.',
  })
  @ApiOkResponse({
    description: 'Client ID returned successfully',
    schema: { example: { clientId: '123456789-abc.apps.googleusercontent.com' } },
  })
  public getGoogleClientId(): { clientId: string } {
    return { clientId: this.gatewayConfig.googleClientId };
  }

  @Post('google/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Google Login & Registration',
    description:
      'Universal endpoint for Google OAuth2. If the user does not exist, it registers them automatically. If the user exists, it logs them in. In both cases, it returns an accessToken in the body and sets a refreshToken in HttpOnly cookies. No additional requests are needed after a successful call.',
  })
  @ApiOkResponse({
    description: 'Login successful',
    schema: { example: { accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' } },
  })
  @ApiDomainError(401, 'Invalid Google token', 'Unauthorized')
  public async googleLogin(
    @Body() dto: GoogleLoginDto,
    @SessionInfo() sessionMeta: SessionMetaData,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    const tokens: AuthTokens = await this.commandBus.execute(
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

    this.setRefreshTokenCookie(res, tokens.refreshToken);

    return { accessToken: tokens.accessToken };
  }

  private setRefreshTokenCookie(
    res: Response,
    refreshToken: string,
    options: Pick<CookieOptions, 'maxAge'> = {},
  ): void {
    // WARNING: If authentication tests suddenly start failing locally or in CI/CD (deploy),
    // check this cookie configuration first!
    // Modern browsers (including headless ones like Playwright) strict-drop cookies with
    // `sameSite: 'none'` + `secure: true` if they are sent over plain HTTP.
    // - Local dev/testing: Works fine on `http://localhost` due to browser exceptions.
    // - CI/CD / Deploy: Will FAIL over plain HTTP on non-localhost domains or custom IPs.
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      ...options,
    });
  }
}
