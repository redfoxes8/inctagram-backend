// import { Test, TestingModule } from '@nestjs/testing';
// import { CleanupPendingFilesCron } from '../../src/modules/cron/cleanup-pending-files.cron';
// import { IFilesRepository } from '../../src/modules/files/domain/interfaces/files.repository.interface';
// import { IStorageAdapter } from '../../src/modules/files/application/interfaces/storage-adapter.interface';
// import { FileStatus, FileType } from '../../src/core/prisma/client';
//
// describe('CleanupPendingFilesCron - Unit Tests', () => {
//   let cron: CleanupPendingFilesCron;
//   let filesRepository: jest.Mocked<IFilesRepository>;
//   let storageAdapter: jest.Mocked<IStorageAdapter>;
//
//   beforeEach(async () => {
//     const module: TestingModule = await Test.createTestingModule({
//       providers: [
//         CleanupPendingFilesCron,
//         {
//           provide: IFilesRepository,
//           useValue: {
//             findPendingOlderThan: jest.fn(),
//             findFailedDeleteFiles: jest.fn(),
//             updateStatusMany: jest.fn(),
//             deleteMany: jest.fn(),
//           },
//         },
//         {
//           provide: IStorageAdapter,
//           useValue: {
//             deleteFiles: jest.fn(),
//           },
//         },
//       ],
//     }).compile();
//
//     cron = module.get<CleanupPendingFilesCron>(CleanupPendingFilesCron);
//     filesRepository = module.get(IFilesRepository);
//     storageAdapter = module.get(IStorageAdapter);
//   });
//
//   afterEach(() => {
//     jest.clearAllMocks();
//   });
//
//   describe('cleanupOrphanedPendingFiles', () => {
//     it('должен удалять PENDING файлы старше 24 часов', async () => {
//       const mockFiles = [
//         {
//           id: 'file1',
//           s3Key: 'key1.jpg',
//           fileType: FileType.AVATAR,
//         },
//       ];
//
//       const findPendingSpy = jest
//         .spyOn(filesRepository, 'findPendingOlderThan')
//         .mockResolvedValue(mockFiles as any);
//       const storageDeleteFilesSpy = jest
//         .spyOn(storageAdapter, 'deleteFiles')
//         .mockResolvedValue(undefined);
//       const updateStatusSpy = jest.spyOn(filesRepository, 'updateStatusMany');
//       const deleteManySpy = jest.spyOn(filesRepository, 'deleteMany');
//
//       await cron.cleanupOrphanedPendingFiles();
//
//       expect(findPendingSpy).toHaveBeenCalled();
//       expect(updateStatusSpy).toHaveBeenCalledWith(['file1'], FileStatus.DELETING);
//       expect(storageDeleteFilesSpy).toHaveBeenCalled();
//       expect(deleteManySpy).toHaveBeenCalledWith(['file1']);
//     });
//
//     it('должен группировать файлы по типу для удаления', async () => {
//       const mockFiles = [
//         {
//           id: 'file1',
//           s3Key: 'key1.jpg',
//           fileType: FileType.AVATAR,
//         },
//         {
//           id: 'file2',
//           s3Key: 'key2.jpg',
//           fileType: FileType.AVATAR,
//         },
//         {
//           id: 'file3',
//           s3Key: 'key3.jpg',
//           fileType: FileType.POST_IMAGE,
//         },
//       ];
//
//       filesRepository.findPendingOlderThan.mockResolvedValue(mockFiles as any);
//       const storageDeleteFilesSpy = jest
//         .spyOn(storageAdapter, 'deleteFiles')
//         .mockResolvedValue(undefined);
//
//       await cron.cleanupOrphanedPendingFiles();
//
//       expect(storageDeleteFilesSpy).toHaveBeenCalledWith(['key1.jpg', 'key2.jpg'], FileType.AVATAR);
//       expect(storageDeleteFilesSpy).toHaveBeenCalledWith(['key3.jpg'], FileType.POST_IMAGE);
//     });
//
//     it('должен устанавливать FAILED_DELETE при ошибке удаления из S3', async () => {
//       const mockFiles = [
//         {
//           id: 'file1',
//           s3Key: 'key1.jpg',
//           fileType: FileType.AVATAR,
//         },
//       ];
//       const updateStatusSpy = jest.spyOn(filesRepository, 'updateStatusMany');
//       const deleteManySpy = jest.spyOn(filesRepository, 'deleteMany');
//       filesRepository.findPendingOlderThan.mockResolvedValue(mockFiles as any);
//       storageAdapter.deleteFiles.mockRejectedValue(new Error('S3 error'));
//
//       await cron.cleanupOrphanedPendingFiles();
//
//       expect(updateStatusSpy).toHaveBeenCalledWith(['file1'], FileStatus.FAILED_DELETE);
//       expect(deleteManySpy).not.toHaveBeenCalled();
//     });
//
//     it('должен обрабатывать пачки файлов (limit)', async () => {
//       const mockFiles1 = Array(500)
//         .fill(null)
//         .map((_, i) => ({
//           id: `file${i}`,
//           s3Key: `key${i}.jpg`,
//           fileType: FileType.AVATAR,
//         }));
//
//       const mockFiles2 = [
//         {
//           id: 'file500',
//           s3Key: 'key500.jpg',
//           fileType: FileType.AVATAR,
//         },
//       ];
//       const findPendingSpy = jest
//         .spyOn(filesRepository, 'findPendingOlderThan')
//         .mockResolvedValueOnce(mockFiles1 as any)
//         .mockResolvedValueOnce(mockFiles2 as any)
//         .mockResolvedValueOnce([]);
//       storageAdapter.deleteFiles.mockResolvedValue(undefined);
//
//       await cron.cleanupOrphanedPendingFiles();
//
//       expect(findPendingSpy).toHaveBeenCalledTimes(3);
//     });
//
//     it('должен ничего не делать если нет старых PENDING файлов', async () => {
//       filesRepository.findPendingOlderThan.mockResolvedValue([]);
//
//       await cron.cleanupOrphanedPendingFiles();
//       const updateStatusSpy = jest.spyOn(filesRepository, 'updateStatusMany');
//       const storageDeleteFilesSpy = jest.spyOn(storageAdapter, 'deleteFiles');
//       expect(updateStatusSpy).not.toHaveBeenCalled();
//       expect(storageDeleteFilesSpy).not.toHaveBeenCalled();
//     });
//   });
//
//   describe('retryFailedDeletes', () => {
//     it('должен повторно удалять файлы со статусом FAILED_DELETE', async () => {
//       const mockFiles = [
//         {
//           id: 'file1',
//           s3Key: 'key1.jpg',
//           fileType: FileType.AVATAR,
//         },
//       ];
//
//       const findFailedDeleteSpy = jest
//         .spyOn(filesRepository, 'findFailedDeleteFiles')
//         .mockResolvedValue(mockFiles as any);
//       const updateStatusSpy = jest.spyOn(filesRepository, 'updateStatusMany');
//       const storageDeleteFilesSpy = jest
//         .spyOn(storageAdapter, 'deleteFiles')
//         .mockResolvedValue(undefined);
//       const deleteManySpy = jest.spyOn(filesRepository, 'deleteMany');
//
//       await cron.retryFailedDeletes();
//
//       expect(findFailedDeleteSpy).toHaveBeenCalled();
//       expect(updateStatusSpy).toHaveBeenCalledWith(['file1'], FileStatus.DELETING);
//       expect(storageDeleteFilesSpy).toHaveBeenCalled();
//       expect(deleteManySpy).toHaveBeenCalledWith(['file1']);
//     });
//
//     it('должен группировать FAILED_DELETE файлы по типу', async () => {
//       const mockFiles = [
//         {
//           id: 'file1',
//           s3Key: 'key1.jpg',
//           fileType: FileType.AVATAR,
//         },
//         {
//           id: 'file2',
//           s3Key: 'key2.jpg',
//           fileType: FileType.POST_IMAGE,
//         },
//       ];
//
//       filesRepository.findFailedDeleteFiles.mockResolvedValue(mockFiles as any);
//
//       const storageDeleteFilesSpy = jest
//         .spyOn(storageAdapter, 'deleteFiles')
//         .mockResolvedValue(undefined);
//       await cron.retryFailedDeletes();
//
//       expect(storageDeleteFilesSpy).toHaveBeenCalledWith(['key1.jpg'], FileType.AVATAR);
//       expect(storageDeleteFilesSpy).toHaveBeenCalledWith(['key2.jpg'], FileType.POST_IMAGE);
//     });
//
//     it('должен устанавливать FAILED_DELETE снова при повторной ошибке', async () => {
//       const mockFiles = [
//         {
//           id: 'file1',
//           s3Key: 'key1.jpg',
//           fileType: FileType.AVATAR,
//         },
//       ];
//
//       filesRepository.findFailedDeleteFiles.mockResolvedValue(mockFiles as any);
//       storageAdapter.deleteFiles.mockRejectedValue(new Error('S3 error'));
//       const updateStatusSpy = jest.spyOn(filesRepository, 'updateStatusMany');
//       const deleteManySpy = jest.spyOn(filesRepository, 'deleteMany');
//
//       await cron.retryFailedDeletes();
//       expect(updateStatusSpy).toHaveBeenCalledWith(['file1'], FileStatus.FAILED_DELETE);
//       expect(deleteManySpy).not.toHaveBeenCalled();
//     });
//
//     it('должен обрабатывать пачки FAILED_DELETE файлов', async () => {
//       const mockFiles1 = Array(500)
//         .fill(null)
//         .map((_, i) => ({
//           id: `file${i}`,
//           s3Key: `key${i}.jpg`,
//           fileType: FileType.AVATAR,
//         }));
//
//       storageAdapter.deleteFiles.mockResolvedValue(undefined);
//       const findFailedDeleteSpy = jest
//         .spyOn(filesRepository, 'findFailedDeleteFiles')
//         .mockResolvedValueOnce(mockFiles1 as any)
//         .mockResolvedValueOnce([]);
//
//       await cron.retryFailedDeletes();
//
//       expect(findFailedDeleteSpy).toHaveBeenCalledTimes(2);
//     });
//
//     it('должен ничего не делать если нет FAILED_DELETE файлов', async () => {
//       filesRepository.findFailedDeleteFiles.mockResolvedValue([]);
//       const updateStatusSpy = jest.spyOn(filesRepository, 'updateStatusMany');
//       const storageDeleteFilesSpy = jest.spyOn(storageAdapter, 'deleteFiles');
//
//       await cron.retryFailedDeletes();
//
//       expect(updateStatusSpy).not.toHaveBeenCalled();
//       expect(storageDeleteFilesSpy).not.toHaveBeenCalled();
//     });
//   });
//
//   describe('подхват статусов', () => {
//     it('должен корректно подхватывать статус FAILED_DELETE в retryFailedDeletes', async () => {
//       const mockFiles = [
//         {
//           id: 'file1',
//           s3Key: 'key1.jpg',
//           fileType: FileType.AVATAR,
//         },
//       ];
//
//       storageAdapter.deleteFiles.mockResolvedValue(undefined);
//       const findFailedDeleteSpy = jest
//         .spyOn(filesRepository, 'findFailedDeleteFiles')
//         .mockResolvedValue(mockFiles as any);
//
//       await cron.retryFailedDeletes();
//
//       expect(findFailedDeleteSpy).toHaveBeenCalledWith(500);
//     });
//
//     it('должен корректно подхватывать статус DELETING в cleanupOrphanedPendingFiles', async () => {
//       const mockFiles = [
//         {
//           id: 'file1',
//           s3Key: 'key1.jpg',
//           fileType: FileType.AVATAR,
//         },
//       ];
//
//       storageAdapter.deleteFiles.mockResolvedValue(undefined);
//       const findPendingSpy = jest
//         .spyOn(filesRepository, 'findPendingOlderThan')
//         .mockResolvedValue(mockFiles as any);
//       await cron.cleanupOrphanedPendingFiles();
//
//       expect(findPendingSpy).toHaveBeenCalled();
//     });
//   });
// });
