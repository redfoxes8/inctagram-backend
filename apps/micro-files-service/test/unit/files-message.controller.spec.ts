import { Test, TestingModule } from '@nestjs/testing';
import { CommandBus } from '@nestjs/cqrs';
import { FilesMessageController } from '../../src/modules/files/api/files.message.controller';
import { DeleteFilesCommand } from '../../src/modules/files/application/use-cases/delete-files.use-case';
import { Nack } from '@golevelup/nestjs-rabbitmq';

describe('FilesMessageController - Unit Tests', () => {
  let controller: FilesMessageController;
  let commandBus: jest.Mocked<CommandBus>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FilesMessageController],
      providers: [
        {
          provide: CommandBus,
          useValue: {
            execute: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<FilesMessageController>(FilesMessageController);
    commandBus = module.get(CommandBus);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handlePostDeleted', () => {
    it('должен выполнять DeleteFilesCommand при получении события', async () => {
      const msg = { fileIds: ['file1', 'file2'] };

      const commandBusSpy = jest.spyOn(commandBus, 'execute').mockResolvedValue(undefined);

      const result = await controller.handlePostDeleted(msg);

      expect(commandBusSpy).toHaveBeenCalledWith(new DeleteFilesCommand(msg));
      expect(result).toBeUndefined();
    });

    it('должен возвращать Nack при ошибке выполнения команды', async () => {
      const msg = { fileIds: ['file1'] };

      const commandBusSpy = jest
        .spyOn(commandBus, 'execute')
        .mockRejectedValue(new Error('Some error'));
      const result = await controller.handlePostDeleted(msg);

      expect(commandBusSpy).toHaveBeenCalledWith(new DeleteFilesCommand(msg));
      expect(result).toBeInstanceOf(Nack);
    });
  });
});
