import { Test, TestingModule } from '@nestjs/testing';
import {
  DeleteFilesUseCase,
  DeleteFilesCommand,
} from '../../src/modules/files/application/use-cases/delete-files.use-case';
import { IFilesRepository } from '../../src/modules/files/domain/interfaces/files.repository.interface';
import { IStorageAdapter } from '../../src/modules/files/infrastructure/interfaces/storage-adapter.interface';
import { FileStatusDomain, FileType } from '../../src/modules/files/domain/file.types';

describe('Files RabbitMQ Events - E2E Tests', () => {
  let useCase: DeleteFilesUseCase;
  let filesRepository: jest.Mocked<IFilesRepository>;
  let storageAdapter: jest.Mocked<IStorageAdapter>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeleteFilesUseCase,
        {
          provide: IFilesRepository,
          useValue: {
            findByIds: jest.fn(),
            updateStatusMany: jest.fn(),
            deleteMany: jest.fn(),
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

  describe('handlePostDeleted - RabbitMQ event (DeleteFilesUseCase)', () => {
    it('должен инициировать удаление файлов при получении события post_deleted', async () => {
      const mockFiles = [
        {
          id: 'file1',
          s3Key: 'AVATAR/user123/file1.jpg',
          fileType: FileType.AVATAR,
        },
        {
          id: 'file2',
          s3Key: 'POST_IMAGE/user123/file2.jpg',
          fileType: FileType.POST_IMAGE,
        },
      ];

      const findByIdsSpy = jest.spyOn(filesRepository, 'findByIds');
      const deleteFilesSpy = jest.spyOn(storageAdapter, 'deleteFiles');
      const updateStatusManySpy = jest.spyOn(filesRepository, 'updateStatusMany');
      const deleteManySpy = jest.spyOn(filesRepository, 'deleteMany');
      findByIdsSpy.mockResolvedValue(mockFiles as any);
      deleteFilesSpy.mockResolvedValue(undefined);

      await useCase.execute(new DeleteFilesCommand(['file1', 'file2']));
      expect(findByIdsSpy).toHaveBeenCalledWith(['file1', 'file2']);
      expect(updateStatusManySpy).toHaveBeenCalledWith(
        ['file1', 'file2'],
        FileStatusDomain.DELETING,
      );
      expect(deleteFilesSpy).toHaveBeenCalledTimes(2);
      expect(deleteManySpy).toHaveBeenCalledTimes(2);
    });

    it('должен обновлять статус в БД на FAILED_DELETE при ошибке удаления из S3', async () => {
      const mockFiles = [
        {
          id: 'file1',
          s3Key: 'AVATAR/user123/file1.jpg',
          fileType: FileType.AVATAR,
        },
      ];

      const findByIdsSpy = jest.spyOn(filesRepository, 'findByIds');
      const deleteFilesSpy = jest.spyOn(storageAdapter, 'deleteFiles');
      const updateStatusManySpy = jest.spyOn(filesRepository, 'updateStatusMany');
      findByIdsSpy.mockResolvedValue(mockFiles as any);
      deleteFilesSpy.mockRejectedValue(new Error('S3 error'));

      await useCase.execute(new DeleteFilesCommand(['file1']));

      expect(updateStatusManySpy).toHaveBeenCalledWith(['file1'], FileStatusDomain.FAILED_DELETE);
    });

    it('должен удалять файлы из БД после успешного удаления из S3', async () => {
      const mockFiles = [
        {
          id: 'file1',
          s3Key: 'AVATAR/user123/file1.jpg',
          fileType: FileType.AVATAR,
        },
      ];

      const findByIdsSpy = jest.spyOn(filesRepository, 'findByIds');
      const deleteFilesSpy = jest.spyOn(storageAdapter, 'deleteFiles');
      const deleteManySpy = jest.spyOn(filesRepository, 'deleteMany');
      findByIdsSpy.mockResolvedValue(mockFiles as any);
      deleteFilesSpy.mockResolvedValue(undefined);

      await useCase.execute(new DeleteFilesCommand(['file1']));

      expect(deleteManySpy).toHaveBeenCalledWith(['file1']);
    });

    it('должен игнорировать события с пустым списком fileIds', async () => {
      const findByIdsSpy = jest.spyOn(filesRepository, 'findByIds');
      const deleteFilesSpy = jest.spyOn(storageAdapter, 'deleteFiles');

      await useCase.execute(new DeleteFilesCommand([]));

      expect(findByIdsSpy).not.toHaveBeenCalled();
      expect(deleteFilesSpy).not.toHaveBeenCalled();
    });

    it('должен группировать файлы по типу для удаления', async () => {
      const mockFiles = [
        {
          id: 'file1',
          s3Key: 'AVATAR/user123/file1.jpg',
          fileType: FileType.AVATAR,
        },
        {
          id: 'file2',
          s3Key: 'AVATAR/user123/file2.jpg',
          fileType: FileType.AVATAR,
        },
        {
          id: 'file3',
          s3Key: 'POST_IMAGE/user123/file3.jpg',
          fileType: FileType.POST_IMAGE,
        },
      ];

      const findByIdsSpy = jest.spyOn(filesRepository, 'findByIds');
      const deleteFilesSpy = jest.spyOn(storageAdapter, 'deleteFiles');
      findByIdsSpy.mockResolvedValue(mockFiles as any);
      deleteFilesSpy.mockResolvedValue(undefined);

      await useCase.execute(new DeleteFilesCommand(['file1', 'file2', 'file3']));

      expect(deleteFilesSpy).toHaveBeenCalledWith(
        ['AVATAR/user123/file1.jpg', 'AVATAR/user123/file2.jpg'],
        FileType.AVATAR,
      );
      expect(deleteFilesSpy).toHaveBeenCalledWith(
        ['POST_IMAGE/user123/file3.jpg'],
        FileType.POST_IMAGE,
      );
    });

    it('должен обрабатывать частичный сбой при удалении из S3', async () => {
      const mockFiles = [
        {
          id: 'file1',
          s3Key: 'AVATAR/user123/file1.jpg',
          fileType: FileType.AVATAR,
        },
        {
          id: 'file2',
          s3Key: 'POST_IMAGE/user123/file2.jpg',
          fileType: FileType.POST_IMAGE,
        },
      ];

      const findByIdsSpy = jest.spyOn(filesRepository, 'findByIds');
      const deleteFilesSpy = jest.spyOn(storageAdapter, 'deleteFiles');
      const updateStatusManySpy = jest.spyOn(filesRepository, 'updateStatusMany');
      const deleteManySpy = jest.spyOn(filesRepository, 'deleteMany');
      findByIdsSpy.mockResolvedValue(mockFiles as any);
      deleteFilesSpy
        .mockRejectedValueOnce(new Error('S3 error for AVATAR'))
        .mockResolvedValueOnce(undefined);

      await useCase.execute(new DeleteFilesCommand(['file1', 'file2']));

      expect(updateStatusManySpy).toHaveBeenCalledWith(['file1'], FileStatusDomain.FAILED_DELETE);
      expect(deleteManySpy).toHaveBeenCalledWith(['file2']);
    });

    it('должен устанавливать временный статус DELETING перед удалением', async () => {
      const mockFiles = [
        {
          id: 'file1',
          s3Key: 'AVATAR/user123/file1.jpg',
          fileType: FileType.AVATAR,
        },
      ];

      const findByIdsSpy = jest.spyOn(filesRepository, 'findByIds');
      const deleteFilesSpy = jest.spyOn(storageAdapter, 'deleteFiles');
      const updateStatusManySpy = jest.spyOn(filesRepository, 'updateStatusMany');
      findByIdsSpy.mockResolvedValue(mockFiles as any);
      deleteFilesSpy.mockResolvedValue(undefined);

      await useCase.execute(new DeleteFilesCommand(['file1']));

      expect(updateStatusManySpy).toHaveBeenCalledWith(['file1'], FileStatusDomain.DELETING);
    });

    it('должен использовать Promise.allSettled для параллельного удаления', async () => {
      const mockFiles = [
        {
          id: 'file1',
          s3Key: 'AVATAR/user123/file1.jpg',
          fileType: FileType.AVATAR,
        },
        {
          id: 'file2',
          s3Key: 'POST_IMAGE/user123/file2.jpg',
          fileType: FileType.POST_IMAGE,
        },
      ];

      const findByIdsSpy = jest.spyOn(filesRepository, 'findByIds');
      const deleteFilesSpy = jest.spyOn(storageAdapter, 'deleteFiles');
      findByIdsSpy.mockResolvedValue(mockFiles as any);
      deleteFilesSpy.mockResolvedValue(undefined);

      await useCase.execute(new DeleteFilesCommand(['file1', 'file2']));

      expect(deleteFilesSpy).toHaveBeenCalledTimes(2);
    });

    it('должен ничего не делать если файлы не найдены в БД', async () => {
      const findByIdsSpy = jest.spyOn(filesRepository, 'findByIds');
      findByIdsSpy.mockResolvedValue([]);

      const deleteFilesSpy = jest.spyOn(storageAdapter, 'deleteFiles');
      const updateStatusManySpy = jest.spyOn(filesRepository, 'updateStatusMany');

      await useCase.execute(new DeleteFilesCommand(['file1']));

      expect(updateStatusManySpy).not.toHaveBeenCalled();
      expect(deleteFilesSpy).not.toHaveBeenCalled();
    });
  });
});
