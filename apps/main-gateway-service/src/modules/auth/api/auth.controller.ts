import { randomUUID } from 'crypto';
import { Body, Controller, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { LoginDto } from './dto/login.dto';
import { PasswordRecoveryDto } from './dto/password-recovery.dto';
import { RegisterUserDto } from './dto/register-user.dto';
import { LoginUseCase } from '../application/use-cases/login.use-case';
import { PasswordRecoveryUseCase } from '../application/use-cases/password-recovery.use-case';
import { RegisterUserUseCase } from '../application/use-cases/register-user.use-case';
import { SessionInfo } from '../../sessions/api/decorators/session-info.decorator';
import type { SessionMetaData } from '../../sessions/api/decorators/session-info.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private loginUseCase: LoginUseCase,
    private registerUserUseCase: RegisterUserUseCase,
    private passwordRecoveryUseCase: PasswordRecoveryUseCase,
  ) {}

  @Post('registration')
  @HttpCode(HttpStatus.CREATED)
  public async registration(@Body() dto: RegisterUserDto): Promise<void> {
    await this.registerUserUseCase.execute(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  public async login(
    @Body() dto: LoginDto,
    @SessionInfo() sessionMeta: SessionMetaData,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    const tokens = await this.loginUseCase.execute(dto, {
      ...sessionMeta,
      deviceId: randomUUID(),
    });

    res.cookie('refreshToken', tokens.refreshToken, { httpOnly: true, secure: true });

    return { accessToken: tokens.accessToken };
  }

  @Post('password-recovery')
  @HttpCode(HttpStatus.OK)
  public async passwordRecovery(@Body() dto: PasswordRecoveryDto): Promise<void> {
    await this.passwordRecoveryUseCase.execute(dto);
  }
}
