import { Test, TestingModule } from '@nestjs/testing';
import {
  DeleteFilesCommand,
  DeleteFilesUseCase,
} from '../../src/modules/files/application/use-cases/delete-files.use-case';
import { IFilesRepository } from '../../src/modules/files/domain/interfaces/files.repository.interface';
import { IStorageAdapter } from '../../src/modules/files/infrastructure/interfaces/storage-adapter.interface';
import { FileStatus } from '../../src/core/prisma/client';
import { resetDb } from '../../../../libs/common/src/testing/reset-db';
import { FileEntity } from '../../src/modules/files/domain/file.entity';
import { FileTypeDomain } from '../../src/modules/files/domain/file.types';
import { randomUUID } from 'crypto';

describe('DeleteFilesUseCase - Unit Tests', () => {
  jest.setTimeout(1000000);
  let useCase: DeleteFilesUseCase;
  let filesRepository: jest.Mocked<IFilesRepository>;
  let storageAdapter: jest.Mocked<IStorageAdapter>;
  const createNewFile = (bucket?: string): FileEntity => {
    const file: FileEntity = FileEntity.createNew({
      fileExtension: '.jpg',
      fileType: FileTypeDomain.AVATAR,
      region: 'region',
      userId: randomUUID(),
    });
    file.setS3Props('s3Key', bucket ?? randomUUID());
    return file;
  };
  beforeAll(async () => {
    await resetDb();
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeleteFilesUseCase,
        {
          provide: IFilesRepository,
          useValue: {
            findByIds: jest.fn(),
            updateStatusManyById: jest.fn(),
            deleteManyByS3Key: jest.fn(),
            updateStatusManyByS3Key: jest.fn(),
          },
        },
        {
          provide: IStorageAdapter,
          useValue: {
            deleteFiles: jest.fn(),
          },
        },
      ],
    }).compile();

    useCase = module.get<DeleteFilesUseCase>(DeleteFilesUseCase);
    filesRepository = module.get(IFilesRepository);
    storageAdapter = module.get(IStorageAdapter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('успешное удаление файлов', () => {
    it('должен успешно удалить файлы из S3 и БД', async () => {
      const file1: FileEntity = createNewFile('AVATAR');
      const file2: FileEntity = createNewFile('POST_IMAGE');

      const findByIdSpy = jest
        .spyOn(filesRepository, 'findByIds')
        .mockResolvedValue([file1, file2]);
      const deleteFilesStorageSpy = jest
        .spyOn(storageAdapter, 'deleteFiles')
        .mockResolvedValue(undefined);
      const updateStatusByIdSpy = jest.spyOn(filesRepository, 'updateStatusManyById');
      const deleteManySpy = jest.spyOn(filesRepository, 'deleteManyByS3Key');

      await useCase.execute(new DeleteFilesCommand({ fileIds: [file1.id, file2.id] }));

      expect(findByIdSpy).toHaveBeenCalledWith([file1.id, file2.id]);
      expect(updateStatusByIdSpy).toHaveBeenCalledWith([file1.id, file2.id], FileStatus.DELETING);
      expect(deleteFilesStorageSpy).toHaveBeenCalledTimes(2);
      expect(deleteManySpy).toHaveBeenCalledTimes(2);
    });

    it('должен группировать файлы по бакету для удаления', async () => {
      const file1: FileEntity = createNewFile('AVATAR');
      const file2: FileEntity = createNewFile('AVATAR');
      const file3: FileEntity = createNewFile('POST_IMAGE');

      filesRepository.findByIds.mockResolvedValue([file1, file2, file3]);
      const deleteFilesStorageSpy = jest
        .spyOn(storageAdapter, 'deleteFiles')
        .mockResolvedValue(undefined);

      await useCase.execute(new DeleteFilesCommand({ fileIds: [file1.id, file2.id, file3.id] }));

      expect(deleteFilesStorageSpy).toHaveBeenCalledWith('AVATAR', [
        file1.getS3Key(),
        file2.getS3Key(),
      ]);
      expect(deleteFilesStorageSpy).toHaveBeenCalledWith('POST_IMAGE', [file3.getS3Key()]);
    });

    it('должен ничего не делать если список файлов пуст', async () => {
      await useCase.execute(new DeleteFilesCommand({ fileIds: [] }));

      const findByIdSpy = jest.spyOn(filesRepository, 'findByIds');
      const deleteFilesStorageSpy = jest.spyOn(storageAdapter, 'deleteFiles');

      expect(findByIdSpy).not.toHaveBeenCalled();
      expect(deleteFilesStorageSpy).not.toHaveBeenCalled();
    });

    it('должен ничего не делать если файлы не найдены в БД', async () => {
      filesRepository.findByIds.mockResolvedValue([]);

      await useCase.execute(new DeleteFilesCommand({ fileIds: ['file1'] }));
      const updateStatusByIdSpy = jest.spyOn(filesRepository, 'updateStatusManyById');
      const deleteFilesStorageSpy = jest.spyOn(storageAdapter, 'deleteFiles');

      expect(updateStatusByIdSpy).not.toHaveBeenCalled();
      expect(deleteFilesStorageSpy).not.toHaveBeenCalled();
    });
  });

  describe('обработка частичных сбоев при удалении из S3', () => {
    it('должен установить статус FAILED_DELETE при ошибке удаления из S3', async () => {
      const file1: FileEntity = createNewFile('AVATAR');
      const file2: FileEntity = createNewFile('POST_IMAGE');

      filesRepository.findByIds.mockResolvedValue([file1, file2]);
      storageAdapter.deleteFiles
        .mockRejectedValueOnce(new Error('S3 error'))
        .mockResolvedValueOnce(undefined);

      await useCase.execute(new DeleteFilesCommand({ fileIds: [file1.id, file2.id] }));
      const updateStatusByS3KeySpy = jest.spyOn(filesRepository, 'updateStatusManyByS3Key');
      const deleteManySpy = jest.spyOn(filesRepository, 'deleteManyByS3Key');

      expect(updateStatusByS3KeySpy).toHaveBeenCalledWith(
        [file1.getS3Key()],
        FileStatus.FAILED_DELETE,
      );
      expect(deleteManySpy).toHaveBeenCalledWith([file2.getS3Key()]);
    });

    it('должен использовать Promise.allSettled для параллельного удаления', async () => {
      const file1: FileEntity = createNewFile('AVATAR');
      const file2: FileEntity = createNewFile('POST_IMAGE');

      filesRepository.findByIds.mockResolvedValue([file1, file2]);
      const deleteFilesStorageSpy = jest
        .spyOn(storageAdapter, 'deleteFiles')
        .mockResolvedValue(undefined);

      await useCase.execute(new DeleteFilesCommand({ fileIds: [file1.id, file2.id] }));

      // Проверяем что все удаления были запущены
      expect(deleteFilesStorageSpy).toHaveBeenCalledTimes(2);
    });

    it('должен установить FAILED_DELETE для всех файлов одного типа при ошибке', async () => {
      const file1: FileEntity = createNewFile('AVATAR');
      const file2: FileEntity = createNewFile('AVATAR');

      filesRepository.findByIds.mockResolvedValue([file1, file2]);
      storageAdapter.deleteFiles.mockRejectedValue(new Error('S3 error'));
      const updateStatusByS3KeySpy = jest.spyOn(filesRepository, 'updateStatusManyByS3Key');
      const deleteManySpy = jest.spyOn(filesRepository, 'deleteManyByS3Key');

      await useCase.execute(new DeleteFilesCommand({ fileIds: [file1.id, file2.id] }));

      expect(updateStatusByS3KeySpy).toHaveBeenCalledWith(
        [file1.getS3Key(), file2.getS3Key()],
        FileStatus.FAILED_DELETE,
      );
      expect(deleteManySpy).not.toHaveBeenCalled();
    });
  });

  describe('временный статус DELETING', () => {
    it('должен установить временный статус DELETING перед удалением', async () => {
      const file1: FileEntity = createNewFile();

      filesRepository.findByIds.mockResolvedValue([file1]);
      storageAdapter.deleteFiles.mockResolvedValue(undefined);
      const updateStatusByIdSpy = jest.spyOn(filesRepository, 'updateStatusManyById');

      await useCase.execute(new DeleteFilesCommand({ fileIds: [file1.id] }));

      expect(updateStatusByIdSpy).toHaveBeenCalledWith([file1.id], FileStatus.DELETING);
    });
  });
});
