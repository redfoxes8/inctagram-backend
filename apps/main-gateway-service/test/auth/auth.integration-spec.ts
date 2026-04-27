import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from '../../src/modules/auth/api/auth.controller';
import { CommandBus } from '@nestjs/cqrs';
import { RegisterUserDto } from '../../src/modules/auth/api/dto/register-user.dto';
import { CoreConfig } from '../../../../libs/common/src/core.config';

describe('Auth Module - Integration Tests', () => {
  let controller: AuthController;
  let commandBus: CommandBus;
  jest.setTimeout(120000);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: CommandBus,
          useValue: {
            execute: jest.fn(),
          },
        },
        {
          provide: CoreConfig,
          useValue: {
            env: 'test',
          } satisfies Pick<CoreConfig, 'env'>,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    commandBus = module.get<CommandBus>(CommandBus);
  });

  describe('Registration', () => {
    it('должен отправить RegisterUserCommand через CommandBus', async () => {
      const registerDto: RegisterUserDto = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Test@1234',
      };

      const executeSpy = jest.spyOn(commandBus, 'execute').mockResolvedValue(undefined);

      await controller.registration(registerDto);

      expect(executeSpy).toHaveBeenCalled();
      expect(executeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          dto: registerDto,
        }),
      );
    });

    it('должен выбросить ошибку если CommandBus выбросит исключение', async () => {
      const registerDto: RegisterUserDto = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Test@1234',
      };

      jest.spyOn(commandBus, 'execute').mockRejectedValue(new Error('User already exists'));

      await expect(controller.registration(registerDto)).rejects.toThrow('User already exists');
    });
  });

  describe('Login', () => {
    it('должен отправить LoginCommand и вернуть accessToken', async () => {
      const mockTokens = {
        accessToken: 'mock_access_token',
        refreshToken: 'mock_refresh_token',
      };

      jest.spyOn(commandBus, 'execute').mockResolvedValue(mockTokens);

      const mockRequest = {
        user: {
          userId: 'user-123',
          username: 'testuser',
          email: 'test@example.com',
        },
      } as any;

      const mockResponse = {
        cookie: jest.fn(),
      } as any;

      const mockSessionMeta = {
        ip: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
        deviceName: 'Macbook',
      };

      const result = await controller.login(mockRequest, mockSessionMeta, mockResponse);

      expect(result).toEqual({ accessToken: 'mock_access_token' });
      expect(mockResponse.cookie).toHaveBeenCalledWith('refreshToken', 'mock_refresh_token', {
        httpOnly: true,
        secure: true,
      });
    });

    it('должен выбросить ошибку при неправильных credentials', async () => {
      jest.spyOn(commandBus, 'execute').mockRejectedValue(new Error('Invalid credentials'));

      const mockRequest = {
        user: {
          userId: 'user-123',
          username: 'testuser',
          email: 'test@example.com',
        },
      } as any;

      const mockResponse = {
        cookie: jest.fn(),
      } as any;

      const mockSessionMeta = {
        ip: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
        deviceName: 'Android',
      };

      await expect(controller.login(mockRequest, mockSessionMeta, mockResponse)).rejects.toThrow(
        'Invalid credentials',
      );
    });
  });

  describe('Logout', () => {
    it('должен отправить LogoutCommand', async () => {
      const executeSpy = jest.spyOn(commandBus, 'execute').mockResolvedValue(undefined);

      const mockRequest = {
        user: {
          userId: 'user-123',
          deviceId: 'device-123',
        },
      } as any;

      await controller.logout(mockRequest);

      expect(executeSpy).toHaveBeenCalled();
    });

    it('должен выбросить ошибку если сессия не найдена', async () => {
      jest.spyOn(commandBus, 'execute').mockRejectedValue(new Error('Session not found'));

      const mockRequest = {
        user: {
          userId: 'user-123',
          deviceId: 'device-123',
        },
      } as any;

      await expect(controller.logout(mockRequest)).rejects.toThrow('Session not found');
    });
  });

  describe('Password Recovery', () => {
    it('должен отправить PasswordRecoveryCommand', async () => {
      const executeSpy = jest.spyOn(commandBus, 'execute').mockResolvedValue(undefined);

      const passwordRecoveryDto = {
        email: 'test@example.com',
      };

      await controller.passwordRecovery(passwordRecoveryDto);

      expect(executeSpy).toHaveBeenCalled();
    });

    it('должен обработать несуществующий email без ошибок (для безопасности)', async () => {
      jest.spyOn(commandBus, 'execute').mockResolvedValue(undefined);

      const passwordRecoveryDto = {
        email: 'nonexistent@example.com',
      };

      const result = await controller.passwordRecovery(passwordRecoveryDto);

      expect(result).toBeUndefined();
    });
  });

  describe('Change Password', () => {
    it('должен отправить ChangePasswordCommand', async () => {
      const executeSpy = jest.spyOn(commandBus, 'execute').mockResolvedValue(undefined);

      const changePasswordDto = {
        recoveryCode: 'valid-code',
        newPassword: 'NewTest@1234',
      };

      await controller.newPassword(changePasswordDto);

      expect(executeSpy).toHaveBeenCalled();
    });

    it('должен выбросить ошибку при невалидном коде восстановления', async () => {
      jest.spyOn(commandBus, 'execute').mockRejectedValue(new Error('Invalid recovery code'));

      const changePasswordDto = {
        recoveryCode: 'invalid-code',
        newPassword: 'NewTest@1234',
      };

      await expect(controller.newPassword(changePasswordDto)).rejects.toThrow(
        'Invalid recovery code',
      );
    });
  });

  describe('Confirm Email', () => {
    it('должен отправить ConfirmEmailCommand', async () => {
      const executeSpy = jest.spyOn(commandBus, 'execute').mockResolvedValue(undefined);

      const mockResponse = {
        redirect: jest.fn(),
      } as any;

      await controller.confirmEmail('valid-code', mockResponse);

      expect(executeSpy).toHaveBeenCalled();
      expect(mockResponse.redirect).toHaveBeenCalled();
    });

    it('должен редиректить на frontend с параметром confirmed=true', async () => {
      jest.spyOn(commandBus, 'execute').mockResolvedValue(undefined);

      const mockResponse = {
        redirect: jest.fn(),
      } as any;

      process.env.FRONTEND_URL = 'http://localhost:3000';

      await controller.confirmEmail('valid-code', mockResponse);

      expect(mockResponse.redirect).toHaveBeenCalledWith(
        302,
        expect.stringContaining('http://localhost:3000/auth/sign-in?confirmed=true'),
      );
    });

    it('должен выбросить ошибку при невалидном коде подтверждения', async () => {
      jest.spyOn(commandBus, 'execute').mockRejectedValue(new Error('Invalid confirmation code'));

      const mockResponse = {
        redirect: jest.fn(),
      } as any;

      await expect(controller.confirmEmail('invalid-code', mockResponse)).rejects.toThrow(
        'Invalid confirmation code',
      );
    });
  });
});
