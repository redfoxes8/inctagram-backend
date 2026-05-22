import { Test, TestingModule } from '@nestjs/testing';
import { DeleteFilesUseCase, DeleteFilesCommand } from '../../src/modules/files/application/use-cases/delete-files.use-case';
import { IFilesRepository } from '../../src/modules/files/domain/interfaces/files.repository.interface';
import { IStorageAdapter } from '../../src/modules/files/application/interfaces/storage-adapter.interface';
import { FileStatus, FileType } from '../../src/core/prisma/client';

describe('DeleteFilesUseCase - Unit Tests', () => {
  let useCase: DeleteFilesUseCase;
  let filesRepository: jest.Mocked<IFilesRepository>;
  let storageAdapter: jest.Mocked<IStorageAdapter>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeleteFilesUseCase,
        {
          provide: 'IFilesRepository',
          useValue: {
            findByIds: jest.fn(),
            updateStatusMany: jest.fn(),
            deleteMany: jest.fn(),
          },
        },
        {
          provide: 'IStorageAdapter',
          useValue: {
            deleteFiles: jest.fn(),
          },
        },
      ],
    }).compile();

    useCase = module.get<DeleteFilesUseCase>(DeleteFilesUseCase);
    filesRepository = module.get('IFilesRepository');
    storageAdapter = module.get('IStorageAdapter');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('успешное удаление файлов', () => {
    it('должен успешно удалить файлы из S3 и БД', async () => {
      const fileIds = ['file1', 'file2'];
      const mockFiles = [
        {
          id: 'file1',
          s3Key: 'key1.jpg',
          fileType: FileType.AVATAR,
        },
        {
          id: 'file2',
          s3Key: 'key2.jpg',
          fileType: FileType.POST_IMAGE,
        },
      ];

      filesRepository.findByIds.mockResolvedValue(mockFiles as any);
      storageAdapter.deleteFiles.mockResolvedValue(undefined);

      await useCase.execute(new DeleteFilesCommand(fileIds));

      expect(filesRepository.findByIds).toHaveBeenCalledWith(fileIds);
      expect(filesRepository.updateStatusMany).toHaveBeenCalledWith(
        fileIds,
        FileStatus.DELETING,
      );
      expect(storageAdapter.deleteFiles).toHaveBeenCalledTimes(2);
      expect(filesRepository.deleteMany).toHaveBeenCalledTimes(2);
    });

    it('должен группировать файлы по типу для удаления', async () => {
      const fileIds = ['file1', 'file2', 'file3'];
      const mockFiles = [
        {
          id: 'file1',
          s3Key: 'key1.jpg',
          fileType: FileType.AVATAR,
        },
        {
          id: 'file2',
          s3Key: 'key2.jpg',
          fileType: FileType.AVATAR,
        },
        {
          id: 'file3',
          s3Key: 'key3.jpg',
          fileType: FileType.POST_IMAGE,
        },
      ];

      filesRepository.findByIds.mockResolvedValue(mockFiles as any);
      storageAdapter.deleteFiles.mockResolvedValue(undefined);

      await useCase.execute(new DeleteFilesCommand(fileIds));

      expect(storageAdapter.deleteFiles).toHaveBeenCalledWith(
        ['key1.jpg', 'key2.jpg'],
        FileType.AVATAR,
      );
      expect(storageAdapter.deleteFiles).toHaveBeenCalledWith(
        ['key3.jpg'],
        FileType.POST_IMAGE,
      );
    });

    it('должен ничего не делать если список файлов пуст', async () => {
      await useCase.execute(new DeleteFilesCommand([]));

      expect(filesRepository.findByIds).not.toHaveBeenCalled();
      expect(storageAdapter.deleteFiles).not.toHaveBeenCalled();
    });

    it('должен ничего не делать если файлы не найдены в БД', async () => {
      filesRepository.findByIds.mockResolvedValue([]);

      await useCase.execute(new DeleteFilesCommand(['file1']));

      expect(filesRepository.updateStatusMany).not.toHaveBeenCalled();
      expect(storageAdapter.deleteFiles).not.toHaveBeenCalled();
    });
  });

  describe('обработка частичных сбоев при удалении из S3', () => {
    it('должен установить статус FAILED_DELETE при ошибке удаления из S3', async () => {
      const fileIds = ['file1', 'file2'];
      const mockFiles = [
        {
          id: 'file1',
          s3Key: 'key1.jpg',
          fileType: FileType.AVATAR,
        },
        {
          id: 'file2',
          s3Key: 'key2.jpg',
          fileType: FileType.POST_IMAGE,
        },
      ];

      filesRepository.findByIds.mockResolvedValue(mockFiles as any);
      storageAdapter.deleteFiles
        .mockRejectedValueOnce(new Error('S3 error'))
        .mockResolvedValueOnce(undefined);

      await useCase.execute(new DeleteFilesCommand(fileIds));

      expect(filesRepository.updateStatusMany).toHaveBeenCalledWith(
        ['file1'],
        FileStatus.FAILED_DELETE,
      );
      expect(filesRepository.deleteMany).toHaveBeenCalledWith(['file2']);
    });

    it('должен использовать Promise.allSettled для параллельного удаления', async () => {
      const fileIds = ['file1', 'file2'];
      const mockFiles = [
        {
          id: 'file1',
          s3Key: 'key1.jpg',
          fileType: FileType.AVATAR,
        },
        {
          id: 'file2',
          s3Key: 'key2.jpg',
          fileType: FileType.POST_IMAGE,
        },
      ];

      filesRepository.findByIds.mockResolvedValue(mockFiles as any);
      storageAdapter.deleteFiles.mockResolvedValue(undefined);

      await useCase.execute(new DeleteFilesCommand(fileIds));

      // Проверяем что все удаления были запущены
      expect(storageAdapter.deleteFiles).toHaveBeenCalledTimes(2);
    });

    it('должен установить FAILED_DELETE для всех файлов одного типа при ошибке', async () => {
      const fileIds = ['file1', 'file2'];
      const mockFiles = [
        {
          id: 'file1',
          s3Key: 'key1.jpg',
          fileType: FileType.AVATAR,
        },
        {
          id: 'file2',
          s3Key: 'key2.jpg',
          fileType: FileType.AVATAR,
        },
      ];

      filesRepository.findByIds.mockResolvedValue(mockFiles as any);
      storageAdapter.deleteFiles.mockRejectedValue(new Error('S3 error'));

      await useCase.execute(new DeleteFilesCommand(fileIds));

      expect(filesRepository.updateStatusMany).toHaveBeenCalledWith(
        ['file1', 'file2'],
        FileStatus.FAILED_DELETE,
      );
      expect(filesRepository.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('временный статус DELETING', () => {
    it('должен установить временный статус DELETING перед удалением', async () => {
      const fileIds = ['file1'];
      const mockFiles = [
        {
          id: 'file1',
          s3Key: 'key1.jpg',
          fileType: FileType.AVATAR,
        },
      ];

      filesRepository.findByIds.mockResolvedValue(mockFiles as any);
      storageAdapter.deleteFiles.mockResolvedValue(undefined);

      await useCase.execute(new DeleteFilesCommand(fileIds));

      expect(filesRepository.updateStatusMany).toHaveBeenCalledWith(
        fileIds,
        FileStatus.DELETING,
      );
    });
  });
});
