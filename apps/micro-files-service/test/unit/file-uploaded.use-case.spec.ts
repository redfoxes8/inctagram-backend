import { Test, TestingModule } from '@nestjs/testing';
import {
  FileUploadedCommand,
  FileUploadedUseCase,
} from '../../src/modules/files/application/use-cases/file-uploaded.use-case';
import { IFilesRepository } from '../../src/modules/files/domain/interfaces/files.repository.interface';
import { IAsyncEventPublisher } from '../../src/modules/files/infrastructure/interfaces/event-publisher.interface';
import { FileEntity } from '../../src/modules/files/domain/file.entity';
import { FileStatusDomain, FileTypeDomain } from '../../src/modules/files/domain/file.types';
import { randomUUID } from 'crypto';
import { DomainException } from '../../../../libs/common/src/exceptions/domain-exception';

describe('FileUploadedUseCase - Unit Tests', () => {
  let useCase: FileUploadedUseCase;
  let filesRepository: jest.Mocked<IFilesRepository>;
  let eventPublisher: jest.Mocked<IAsyncEventPublisher>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileUploadedUseCase,
        {
          provide: IFilesRepository,
          useValue: {
            findFileByKey: jest.fn(),
            updateStatus: jest.fn(),
          },
        },
        {
          provide: IAsyncEventPublisher,
          useValue: {
            sendFileUploadedEvent: jest.fn(),
          },
        },
      ],
    }).compile();

    useCase = module.get<FileUploadedUseCase>(FileUploadedUseCase);
    filesRepository = module.get(IFilesRepository);
    eventPublisher = module.get(IAsyncEventPublisher);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('должен обновлять статус на UPLOADED и отправлять событие если файл в статусе PENDING', async () => {
      const file = FileEntity.createNew({
        fileExtension: '.jpg',
        userId: randomUUID(),
        fileType: FileTypeDomain.AVATAR,
        region: 'eu-central-1',
      });
      file.setS3Props('s3-key', 'bucket');

      jest.spyOn(filesRepository, 'findFileByKey').mockResolvedValue(file);
      const updateStatusSpy = jest.spyOn(filesRepository, 'updateStatus');
      const sendFileUploadedEventSpy = jest.spyOn(eventPublisher, 'sendFileUploadedEvent');

      await useCase.execute(new FileUploadedCommand('s3-key'));

      expect(updateStatusSpy).toHaveBeenCalledWith(file.id, FileStatusDomain.UPLOADED);
      expect(sendFileUploadedEventSpy).toHaveBeenCalledWith({
        fileId: file.id,
        userId: file.getUserId(),
        s3Key: file.getS3Key(),
        bucket: file.getBucket(),
        fileType: file.getFileType(),
        fileExtension: file.getFileExtension(),
      });
    });

    it('должен отправлять событие без обновления статуса если файл уже UPLOADED', async () => {
      const file = FileEntity.createNew({
        fileExtension: '.jpg',
        userId: randomUUID(),
        fileType: FileTypeDomain.AVATAR,
        region: 'eu-central-1',
      });
      file.setS3Props('s3-key', 'bucket');
      file.updateStatus(FileStatusDomain.UPLOADED);

      jest.spyOn(filesRepository, 'findFileByKey').mockResolvedValue(file);
      const updateStatusSpy = jest.spyOn(filesRepository, 'updateStatus');
      const sendFileUploadedEventSpy = jest.spyOn(eventPublisher, 'sendFileUploadedEvent');

      await useCase.execute(new FileUploadedCommand('s3-key'));

      expect(updateStatusSpy).not.toHaveBeenCalled();
      expect(sendFileUploadedEventSpy).toHaveBeenCalledWith({
        fileId: file.id,
        userId: file.getUserId(),
        s3Key: file.getS3Key(),
        bucket: file.getBucket(),
        fileType: file.getFileType(),
        fileExtension: file.getFileExtension(),
      });
    });

    it('должен выбрасывать DomainException если файл не найден', async () => {
      jest.spyOn(filesRepository, 'findFileByKey').mockResolvedValue(null);
      const sendFileUploadedEventSpy = jest.spyOn(eventPublisher, 'sendFileUploadedEvent');

      await expect(useCase.execute(new FileUploadedCommand('missing-key'))).rejects.toThrow(
        DomainException,
      );
      expect(sendFileUploadedEventSpy).not.toHaveBeenCalled();
    });
  });
});
