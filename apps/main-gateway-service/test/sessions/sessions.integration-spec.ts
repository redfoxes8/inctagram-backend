import { Test, TestingModule } from '@nestjs/testing';
import { SessionsController } from '../../src/modules/sessions/api/security-devices.controller';
import { CommandBus } from '@nestjs/cqrs';
import {
  ISessionsQueryRepository,
  SessionViewModel,
} from '../../src/modules/sessions/domain/interfaces/sessions.query-repository.interface';

describe('Sessions Module - Integration Tests', () => {
  let controller: SessionsController;
  let queryRepository: ISessionsQueryRepository;
  let commandBus: CommandBus;

  jest.setTimeout(120000);

  const mockSession: SessionViewModel = {
    deviceId: 'device-123',
    ip: '192.168.1.1',
    title: 'Chrome on Mac',
    lastActiveDate: new Date().toISOString(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SessionsController],
      providers: [
        {
          provide: ISessionsQueryRepository,
          useValue: {
            getAllActiveSessions: jest.fn(),
          },
        },
        {
          provide: CommandBus,
          useValue: {
            execute: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<SessionsController>(SessionsController);
    queryRepository = module.get<ISessionsQueryRepository>(ISessionsQueryRepository);
    commandBus = module.get<CommandBus>(CommandBus);
  });

  describe('myDevices - Получить все активные сессии', () => {
    it('должен вернуть список активных сессий текущего пользователя', async () => {
      const userId = 'user-123';
      const sessions: SessionViewModel[] = [mockSession];

      const executeSpy = jest
        .spyOn(queryRepository, 'getAllActiveSessions')
        .mockResolvedValue(sessions);

      const mockRequest = {
        user: {
          userId: userId,
        },
      } as any;

      const result = await controller.myDevices(mockRequest);

      expect(result).toEqual(sessions);
      expect(executeSpy).toHaveBeenCalledWith(userId);
    });

    it('должен вернуть пустой массив если нет активных сессий', async () => {
      const userId = 'user-456';

      const executeSpy = jest.spyOn(queryRepository, 'getAllActiveSessions').mockResolvedValue([]);

      const mockRequest = {
        user: {
          userId: userId,
        },
      } as any;

      const result = await controller.myDevices(mockRequest);

      expect(result).toEqual([]);
      expect(executeSpy).toHaveBeenCalledWith(userId);
    });

    it('должен вернуть несколько сессий', async () => {
      const userId = 'user-789';
      const sessions: SessionViewModel[] = [
        mockSession,
        {
          ...mockSession,
          deviceId: 'device-456',
          title: 'Firefox on Linux',
        },
        {
          ...mockSession,
          deviceId: 'device-789',
          title: 'Safari on iPhone',
        },
      ];

      jest.spyOn(queryRepository, 'getAllActiveSessions').mockResolvedValue(sessions);

      const mockRequest = {
        user: {
          userId: userId,
        },
      } as any;

      const result = await controller.myDevices(mockRequest);

      expect(result).toHaveLength(3);
      expect(result).toEqual(sessions);
    });

    it('должен выбросить ошибку если repository выбросит исключение', async () => {
      const userId = 'user-error';

      jest
        .spyOn(queryRepository, 'getAllActiveSessions')
        .mockRejectedValue(new Error('Database error'));

      const mockRequest = {
        user: {
          userId: userId,
        },
      } as any;

      await expect(controller.myDevices(mockRequest)).rejects.toThrow('Database error');
    });
  });

  describe('deactivateOne - Завершить одну сессию', () => {
    it('должен отправить DeactivateOneCommand через CommandBus', async () => {
      const deviceId = 'device-to-deactivate';
      const userId = 'user-123';
      const executeSpy = jest.spyOn(commandBus, 'execute').mockResolvedValue(undefined);

      const mockRequest = {
        user: {
          userId,
        },
      } as any;

      await controller.deactivateOne(deviceId, mockRequest);

      expect(executeSpy).toHaveBeenCalled();
      expect(executeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          dto: { deviceId, userInfo: { userId } },
        }),
      );
    });

    it('должен выбросить ошибку если устройство не найдено', async () => {
      const deviceId = 'nonexistent-device';

      jest.spyOn(commandBus, 'execute').mockRejectedValue(new Error('Device not found'));

      const mockRequest = {
        user: {
          userId: 'user-123',
        },
      } as any;

      await expect(controller.deactivateOne(deviceId, mockRequest)).rejects.toThrow(
        'Device not found',
      );
    });

    it('должен выбросить ошибку если пользователь не является владельцем сессии', async () => {
      const deviceId = 'other-users-device';

      jest
        .spyOn(commandBus, 'execute')
        .mockRejectedValue(new Error('Forbidden: this session belongs to another user'));

      const mockRequest = {
        user: {
          userId: 'user-123',
        },
      } as any;

      await expect(controller.deactivateOne(deviceId, mockRequest)).rejects.toThrow(
        'Forbidden: this session belongs to another user',
      );
    });

    it('должен успешно завершить сессию', async () => {
      const deviceId = 'device-123';

      jest.spyOn(commandBus, 'execute').mockResolvedValue(undefined);

      const mockRequest = {
        user: {
          userId: 'user-123',
        },
      } as any;

      const result = await controller.deactivateOne(deviceId, mockRequest);

      expect(result).toBeUndefined();
    });
  });

  describe('deactivateAll - Завершить все сессии пользователя', () => {
    it('должен отправить DeactivateAllCommand через CommandBus', async () => {
      const userId = 'user-123';
      const executeSpy = jest.spyOn(commandBus, 'execute').mockResolvedValue(undefined);

      const mockRequest = {
        user: {
          userId: userId,
        },
      } as any;

      await controller.deactivateAll(mockRequest);

      expect(executeSpy).toHaveBeenCalled();
      expect(executeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          dto: { userId },
        }),
      );
    });

    it('должен успешно завершить все сессии', async () => {
      const userId = 'user-456';

      jest.spyOn(commandBus, 'execute').mockResolvedValue(undefined);

      const mockRequest = {
        user: {
          userId: userId,
        },
      } as any;

      const result = await controller.deactivateAll(mockRequest);

      expect(result).toBeUndefined();
    });

    it('должен выбросить ошибку если команда не выполнена', async () => {
      const userId = 'user-error';

      jest
        .spyOn(commandBus, 'execute')
        .mockRejectedValue(new Error('Failed to deactivate sessions'));

      const mockRequest = {
        user: {
          userId: userId,
        },
      } as any;

      await expect(controller.deactivateAll(mockRequest)).rejects.toThrow(
        'Failed to deactivate sessions',
      );
    });

    it('должен завершить все сессии даже если их много', async () => {
      const userId = 'user-many-sessions';

      const executeSpy = jest.spyOn(commandBus, 'execute').mockResolvedValue(undefined);

      const mockRequest = {
        user: {
          userId: userId,
        },
      } as any;

      const result = await controller.deactivateAll(mockRequest);

      expect(result).toBeUndefined();
      expect(executeSpy).toHaveBeenCalledTimes(1);
    });

    it('должен обработать случай когда у пользователя нет активных сессий', async () => {
      const userId = 'user-no-sessions';

      jest.spyOn(commandBus, 'execute').mockResolvedValue(undefined);

      const mockRequest = {
        user: {
          userId: userId,
        },
      } as any;

      const result = await controller.deactivateAll(mockRequest);

      expect(result).toBeUndefined();
    });
  });

  describe('Integration between deactivateOne and deactivateAll', () => {
    it('должен обновлять список сессий после завершения', async () => {
      const userId = 'user-123';

      // Первый вызов - возвращаем 2 сессии
      jest
        .spyOn(queryRepository, 'getAllActiveSessions')
        .mockResolvedValueOnce([mockSession, { ...mockSession, deviceId: 'device-456' }]);

      const mockRequest = {
        user: {
          userId: userId,
        },
      } as any;

      const sessionsBefore = await controller.myDevices(mockRequest);
      expect(sessionsBefore).toHaveLength(2);

      // Завершаем одну сессию
      jest.spyOn(commandBus, 'execute').mockResolvedValue(undefined);
      await controller.deactivateOne('device-456', mockRequest);

      // Второй вызов - возвращаем 1 сессию
      jest.spyOn(queryRepository, 'getAllActiveSessions').mockResolvedValueOnce([mockSession]);

      const sessionsAfter = await controller.myDevices(mockRequest);
      expect(sessionsAfter).toHaveLength(1);
    });
  });
});
