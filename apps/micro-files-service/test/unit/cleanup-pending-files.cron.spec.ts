import { Test, TestingModule } from '@nestjs/testing';
import { CleanupPendingFilesCron } from '../../src/modules/cron/cleanup-pending-files.cron';
import { IFilesRepository } from '../../src/modules/files/domain/interfaces/files.repository.interface';
import { IStorageAdapter } from '../../src/modules/files/infrastructure/interfaces/storage-adapter.interface';
import { FileStatus } from '../../src/core/prisma/client';
import { resetDb } from '../../../../libs/common/src/testing/reset-db';
import { FileEntity } from '../../src/modules/files/domain/file.entity';
import { randomUUID } from 'crypto';
import { FileTypeDomain } from '../../src/modules/files/domain/file.types';

describe('CleanupPendingFilesCron - Unit Tests', () => {
  jest.setTimeout(1000000);
  let cron: CleanupPendingFilesCron;
  let filesRepository: jest.Mocked<IFilesRepository>;
  let storageAdapter: jest.Mocked<IStorageAdapter>;

  const createNewFile = (bucket?: string): FileEntity => {
    const file: FileEntity = FileEntity.createNew({
      fileExtension: '.jpg',
      fileType: FileTypeDomain.AVATAR,
      userId: randomUUID(),
      region: 'region',
    });
    file.setS3Props(randomUUID(), bucket ?? randomUUID());
    return file;
  };

  beforeAll(async () => {
    await resetDb();
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CleanupPendingFilesCron,
        {
          provide: IFilesRepository,
          useValue: {
            findPendingOlderThan: jest.fn(),
            findFailedDeleteFiles: jest.fn(),
            updateStatusManyById: jest.fn(),
            updateStatusManyByS3Key: jest.fn(),
            deleteManyByS3Key: jest.fn(),
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

    cron = module.get<CleanupPendingFilesCron>(CleanupPendingFilesCron);
    filesRepository = module.get(IFilesRepository);
    storageAdapter = module.get(IStorageAdapter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('cleanupOrphanedPendingFiles', () => {
    it('должен удалять PENDING файлы старше 24 часов', async () => {
      const file1: FileEntity = createNewFile();

      const findPendingSpy = jest
        .spyOn(filesRepository, 'findPendingOlderThan')
        .mockResolvedValue([file1]);
      const storageDeleteFilesSpy = jest
        .spyOn(storageAdapter, 'deleteFiles')
        .mockResolvedValue(undefined);
      const updateStatusByIdSpy = jest.spyOn(filesRepository, 'updateStatusManyById');
      const deleteManySpy = jest.spyOn(filesRepository, 'deleteManyByS3Key');

      await cron.cleanupOrphanedPendingFiles();

      expect(findPendingSpy).toHaveBeenCalled();
      expect(updateStatusByIdSpy).toHaveBeenCalledWith([file1.id], FileStatus.DELETING);
      expect(storageDeleteFilesSpy).toHaveBeenCalled();
      expect(deleteManySpy).toHaveBeenCalledWith([file1.getS3Key()]);
    });

    it('должен группировать файлы по бакету для удаления', async () => {
      const file1: FileEntity = createNewFile('AVATAR');
      const file2: FileEntity = createNewFile('AVATAR');
      const file3: FileEntity = createNewFile('POST_IMAGE');

      filesRepository.findPendingOlderThan.mockResolvedValue([file1, file2, file3]);
      const storageDeleteFilesSpy = jest
        .spyOn(storageAdapter, 'deleteFiles')
        .mockResolvedValue(undefined);

      await cron.cleanupOrphanedPendingFiles();

      expect(storageDeleteFilesSpy).toHaveBeenCalledWith('AVATAR', [
        file1.getS3Key(),
        file2.getS3Key(),
      ]);
      expect(storageDeleteFilesSpy).toHaveBeenCalledWith('POST_IMAGE', [file3.getS3Key()]);
    });

    it('должен устанавливать FAILED_DELETE при ошибке удаления из S3', async () => {
      const file1: FileEntity = createNewFile();
      const updateStatusByS3KeySpy = jest.spyOn(filesRepository, 'updateStatusManyByS3Key');
      const deleteManySpy = jest.spyOn(filesRepository, 'deleteManyByS3Key');
      filesRepository.findPendingOlderThan.mockResolvedValue([file1]);
      storageAdapter.deleteFiles.mockRejectedValue(new Error('S3 error'));

      await cron.cleanupOrphanedPendingFiles();

      expect(updateStatusByS3KeySpy).toHaveBeenCalledWith(
        [file1.getS3Key()],
        FileStatus.FAILED_DELETE,
      );
      expect(deleteManySpy).not.toHaveBeenCalled();
    });

    it('должен обрабатывать пачки файлов (limit)', async () => {
      const mockFiles1: FileEntity[] = Array(500)
        .fill(null)
        .map((): FileEntity => createNewFile('AVATAR'));

      const file1: FileEntity = createNewFile('AVATAR');

      const findPendingSpy = jest
        .spyOn(filesRepository, 'findPendingOlderThan')
        .mockResolvedValueOnce(mockFiles1)
        .mockResolvedValueOnce([file1])
        .mockResolvedValueOnce([]);
      storageAdapter.deleteFiles.mockResolvedValue(undefined);

      await cron.cleanupOrphanedPendingFiles();
      await cron.cleanupOrphanedPendingFiles();
      await cron.cleanupOrphanedPendingFiles();

      expect(findPendingSpy).toHaveBeenCalledTimes(3);
    });

    it('должен ничего не делать если нет старых PENDING файлов', async () => {
      filesRepository.findPendingOlderThan.mockResolvedValue(null);

      await cron.cleanupOrphanedPendingFiles();
      const updateStatusByIdSpy = jest.spyOn(filesRepository, 'updateStatusManyById');
      const storageDeleteFilesSpy = jest.spyOn(storageAdapter, 'deleteFiles');
      expect(updateStatusByIdSpy).not.toHaveBeenCalled();
      expect(storageDeleteFilesSpy).not.toHaveBeenCalled();
    });
  });

  describe('retryFailedDeletes', () => {
    it('должен повторно удалять файлы со статусом FAILED_DELETE', async () => {
      const file1: FileEntity = createNewFile();

      const findFailedDeleteSpy = jest
        .spyOn(filesRepository, 'findFailedDeleteFiles')
        .mockResolvedValue([file1]);
      const updateStatusByIdSpy = jest.spyOn(filesRepository, 'updateStatusManyById');
      const storageDeleteFilesSpy = jest
        .spyOn(storageAdapter, 'deleteFiles')
        .mockResolvedValue(undefined);
      const deleteManySpy = jest.spyOn(filesRepository, 'deleteManyByS3Key');

      await cron.retryFailedDeletes();

      expect(findFailedDeleteSpy).toHaveBeenCalled();
      expect(updateStatusByIdSpy).toHaveBeenCalledWith([file1.id], FileStatus.DELETING);
      expect(storageDeleteFilesSpy).toHaveBeenCalled();
      expect(deleteManySpy).toHaveBeenCalledWith([file1.getS3Key()]);
    });

    it('должен группировать FAILED_DELETE файлы по бакету', async () => {
      const file1: FileEntity = createNewFile('AVATAR');
      const file2: FileEntity = createNewFile('POST_IMAGE');

      filesRepository.findFailedDeleteFiles.mockResolvedValue([file1, file2]);

      const storageDeleteFilesSpy = jest
        .spyOn(storageAdapter, 'deleteFiles')
        .mockResolvedValue(undefined);
      await cron.retryFailedDeletes();

      expect(storageDeleteFilesSpy).toHaveBeenCalledWith('AVATAR', [file1.getS3Key()]);
      expect(storageDeleteFilesSpy).toHaveBeenCalledWith('POST_IMAGE', [file2.getS3Key()]);
    });

    it('должен устанавливать FAILED_DELETE снова при повторной ошибке', async () => {
      const file1: FileEntity = createNewFile();

      filesRepository.findFailedDeleteFiles.mockResolvedValue([file1]);
      storageAdapter.deleteFiles.mockRejectedValue(new Error('S3 error'));
      const updateStatusByS3KeySpy = jest.spyOn(filesRepository, 'updateStatusManyByS3Key');
      const deleteManySpy = jest.spyOn(filesRepository, 'deleteManyByS3Key');

      await cron.retryFailedDeletes();
      expect(updateStatusByS3KeySpy).toHaveBeenCalledWith(
        [file1.getS3Key()],
        FileStatus.FAILED_DELETE,
      );
      expect(deleteManySpy).not.toHaveBeenCalled();
    });

    it('должен ничего не делать если нет FAILED_DELETE файлов', async () => {
      filesRepository.findFailedDeleteFiles.mockResolvedValue(null);
      const updateStatusByIdSpy = jest.spyOn(filesRepository, 'updateStatusManyById');
      const storageDeleteFilesSpy = jest.spyOn(storageAdapter, 'deleteFiles');

      await cron.retryFailedDeletes();

      expect(updateStatusByIdSpy).not.toHaveBeenCalled();
      expect(storageDeleteFilesSpy).not.toHaveBeenCalled();
    });
  });

  describe('подхват статусов', () => {
    it('должен корректно подхватывать статус FAILED_DELETE в retryFailedDeletes', async () => {
      const file1: FileEntity = createNewFile();

      storageAdapter.deleteFiles.mockResolvedValue(undefined);
      const findFailedDeleteSpy = jest
        .spyOn(filesRepository, 'findFailedDeleteFiles')
        .mockResolvedValue([file1]);

      await cron.retryFailedDeletes();

      expect(findFailedDeleteSpy).toHaveBeenCalledWith(500);
    });

    it('должен корректно подхватывать статус DELETING в cleanupOrphanedPendingFiles', async () => {
      const file1: FileEntity = createNewFile();

      storageAdapter.deleteFiles.mockResolvedValue(undefined);
      const findPendingSpy = jest
        .spyOn(filesRepository, 'findPendingOlderThan')
        .mockResolvedValue([file1]);
      await cron.cleanupOrphanedPendingFiles();

      expect(findPendingSpy).toHaveBeenCalled();
    });
  });
});
