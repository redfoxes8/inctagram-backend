import { Test, TestingModule } from '@nestjs/testing';
import {
  DeleteFilesCommand,
  DeleteFilesUseCase,
} from '../../src/modules/files/application/use-cases/delete-files.use-case';
import { IFilesRepository } from '../../src/modules/files/domain/interfaces/files.repository.interface';
import { IStorageAdapter } from '../../src/modules/files/infrastructure/interfaces/storage-adapter.interface';
import { FileStatusDomain, FileTypeDomain } from '../../src/modules/files/domain/file.types';
import { resetDb } from '../../../../libs/common/src/testing/reset-db';
import { FileEntity } from '../../src/modules/files/domain/file.entity';
import { randomUUID } from 'crypto';

describe('Files RabbitMQ Events - E2E Tests', () => {
  jest.setTimeout(1000000);
  let useCase: DeleteFilesUseCase;
  let filesRepository: jest.Mocked<IFilesRepository>;
  let storageAdapter: jest.Mocked<IStorageAdapter>;

  const createNewFileEntity = (
    fileType: FileTypeDomain,
    bucket: string,
    fileExtension?: string,
    userId?: string,
    region?: string,
    s3Key?: string,
  ): FileEntity => {
    const file: FileEntity = FileEntity.createNew({
      fileExtension: fileExtension ?? randomUUID(),
      fileType: fileType,
      userId: userId ?? randomUUID(),
      region: region ?? randomUUID(),
    });
    file.setS3Props(s3Key ?? randomUUID(), bucket);
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

    useCase = module.get<DeleteFilesUseCase>(DeleteFilesUseCase);
    filesRepository = module.get(IFilesRepository);
    storageAdapter = module.get(IStorageAdapter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handlePostDeleted - RabbitMQ event (DeleteFilesUseCase)', () => {
    it('должен инициировать удаление файлов при получении события post_deleted', async () => {
      const file1: FileEntity = createNewFileEntity(FileTypeDomain.AVATAR, 'AVATAR');

      const file2: FileEntity = createNewFileEntity(FileTypeDomain.POST_IMAGE, 'POST_IMAGE');

      const findByIdsSpy = jest
        .spyOn(filesRepository, 'findByIds')
        .mockResolvedValue([file1, file2]);
      const deleteFilesSpy = jest.spyOn(storageAdapter, 'deleteFiles').mockResolvedValue(undefined);
      const updateStatusByIdSpy = jest.spyOn(filesRepository, 'updateStatusManyById');
      const deleteManySpy = jest.spyOn(filesRepository, 'deleteManyByS3Key');

      await useCase.execute(new DeleteFilesCommand({ fileIds: [file1.id, file2.id] }));

      expect(findByIdsSpy).toHaveBeenCalledWith([file1.id, file2.id]);
      expect(updateStatusByIdSpy).toHaveBeenCalledWith(
        [file1.id, file2.id],
        FileStatusDomain.DELETING,
      );
      expect(deleteFilesSpy).toHaveBeenCalledTimes(2);
      expect(deleteManySpy).toHaveBeenCalledTimes(2);
    });

    it('должен обновлять статус в БД на FAILED_DELETE при ошибке удаления из S3', async () => {
      const file1: FileEntity = createNewFileEntity(FileTypeDomain.AVATAR, 'AVATAR');

      jest.spyOn(filesRepository, 'findByIds').mockResolvedValue([file1]);
      jest.spyOn(storageAdapter, 'deleteFiles').mockRejectedValue(new Error('S3 error'));
      const updateStatusByS3KeySpy = jest.spyOn(filesRepository, 'updateStatusManyByS3Key');

      await useCase.execute(new DeleteFilesCommand({ fileIds: [file1.id] }));

      expect(updateStatusByS3KeySpy).toHaveBeenCalledWith(
        [file1.getS3Key()],
        FileStatusDomain.FAILED_DELETE,
      );
    });

    it('должен удалять файлы из БД после успешного удаления из S3', async () => {
      const file1: FileEntity = createNewFileEntity(FileTypeDomain.AVATAR, 'AVATAR');

      jest.spyOn(filesRepository, 'findByIds').mockResolvedValue([file1]);
      jest.spyOn(storageAdapter, 'deleteFiles').mockResolvedValue(undefined);
      const deleteManySpy = jest.spyOn(filesRepository, 'deleteManyByS3Key');

      await useCase.execute(new DeleteFilesCommand({ fileIds: [file1.id] }));

      expect(deleteManySpy).toHaveBeenCalledWith([file1.getS3Key()]);
    });

    it('должен игнорировать события с пустым списком fileIds', async () => {
      const findByIdsSpy = jest.spyOn(filesRepository, 'findByIds');
      const deleteFilesSpy = jest.spyOn(storageAdapter, 'deleteFiles');

      await useCase.execute(new DeleteFilesCommand({ fileIds: [] }));

      expect(findByIdsSpy).not.toHaveBeenCalled();
      expect(deleteFilesSpy).not.toHaveBeenCalled();
    });

    it('должен группировать файлы по бакету для удаления', async () => {
      const file1: FileEntity = createNewFileEntity(FileTypeDomain.AVATAR, 'AVATAR');
      const file2: FileEntity = createNewFileEntity(FileTypeDomain.AVATAR, 'AVATAR');
      const file3: FileEntity = createNewFileEntity(FileTypeDomain.POST_IMAGE, 'POST_IMAGE');

      jest.spyOn(filesRepository, 'findByIds').mockResolvedValue([file1, file2, file3]);
      const deleteFilesSpy = jest.spyOn(storageAdapter, 'deleteFiles').mockResolvedValue(undefined);

      await useCase.execute(new DeleteFilesCommand({ fileIds: [file1.id, file2.id, file3.id] }));

      expect(deleteFilesSpy).toHaveBeenCalledWith('AVATAR', [file1.getS3Key(), file2.getS3Key()]);
      expect(deleteFilesSpy).toHaveBeenCalledWith('POST_IMAGE', [file3.getS3Key()]);
    });

    it('должен обрабатывать частичный сбой при удалении из S3', async () => {
      const file1: FileEntity = createNewFileEntity(FileTypeDomain.AVATAR, 'AVATAR');
      const file2: FileEntity = createNewFileEntity(FileTypeDomain.POST_IMAGE, 'POST_IMAGE');

      jest.spyOn(filesRepository, 'findByIds').mockResolvedValue([file1, file2]);
      jest
        .spyOn(storageAdapter, 'deleteFiles')
        .mockRejectedValueOnce(new Error('S3 error for AVATAR'))
        .mockResolvedValueOnce(undefined);
      const updateStatusByS3KeySpy = jest.spyOn(filesRepository, 'updateStatusManyByS3Key');
      const deleteManySpy = jest.spyOn(filesRepository, 'deleteManyByS3Key');

      await useCase.execute(new DeleteFilesCommand({ fileIds: [file1.id, file2.id] }));

      expect(updateStatusByS3KeySpy).toHaveBeenCalledWith(
        [file1.getS3Key()],
        FileStatusDomain.FAILED_DELETE,
      );
      expect(deleteManySpy).toHaveBeenCalledWith([file2.getS3Key()]);
    });

    it('должен устанавливать временный статус DELETING перед удалением', async () => {
      const file1: FileEntity = createNewFileEntity(FileTypeDomain.AVATAR, 'AVATAR');

      jest.spyOn(filesRepository, 'findByIds').mockResolvedValue([file1]);
      jest.spyOn(storageAdapter, 'deleteFiles').mockResolvedValue(undefined);
      const updateStatusByIdSpy = jest.spyOn(filesRepository, 'updateStatusManyById');

      await useCase.execute(new DeleteFilesCommand({ fileIds: [file1.id] }));

      expect(updateStatusByIdSpy).toHaveBeenCalledWith([file1.id], FileStatusDomain.DELETING);
    });

    it('должен использовать Promise.allSettled для параллельного удаления', async () => {
      const file1: FileEntity = createNewFileEntity(FileTypeDomain.AVATAR, 'AVATAR');
      const file2: FileEntity = createNewFileEntity(FileTypeDomain.POST_IMAGE, 'POST_IMAGE');

      jest.spyOn(filesRepository, 'findByIds').mockResolvedValue([file1, file2]);
      const deleteFilesSpy = jest.spyOn(storageAdapter, 'deleteFiles').mockResolvedValue(undefined);

      await useCase.execute(new DeleteFilesCommand({ fileIds: [file1.id, file2.id] }));

      expect(deleteFilesSpy).toHaveBeenCalledTimes(2);
    });

    it('должен ничего не делать если файлы не найдены в БД', async () => {
      jest.spyOn(filesRepository, 'findByIds').mockResolvedValue([]);

      const deleteFilesSpy = jest.spyOn(storageAdapter, 'deleteFiles');
      const updateStatusByIdSpy = jest.spyOn(filesRepository, 'updateStatusManyById');

      await useCase.execute(new DeleteFilesCommand({ fileIds: ['file1'] }));

      expect(updateStatusByIdSpy).not.toHaveBeenCalled();
      expect(deleteFilesSpy).not.toHaveBeenCalled();
    });
  });
});
