import { GrpcRequestMapper } from '../../src/modules/files/api/mappers/grpc-request.mapper';
import { GrpcResponseMapper } from '../../src/modules/files/api/mappers/grpc-response.mapper';
import { FileEntity } from '../../src/modules/files/domain/file.entity';
import { FileTypeDomain } from '../../src/modules/files/domain/file.types';
import { GenerateUploadUrlRequest } from '@inctagram/contracts';
import { randomUUID } from 'crypto';

describe('GrpcMappers - Unit Tests', () => {
  describe('GrpcRequestMapper', () => {
    it('должен маппить AVATAR (1) в FileTypeDomain.AVATAR', () => {
      const request: GenerateUploadUrlRequest = {
        ownerId: randomUUID(),
        fileExtension: '.jpg',
        fileType: 1,
        fileSize: 1024,
      };

      const dto = GrpcRequestMapper.generateUrlForUploadRequest(request);

      expect(dto.fileType).toBe(FileTypeDomain.AVATAR);
      expect(dto.ownerId).toBe(request.ownerId);
      expect(dto.fileExtension).toBe('.jpg');
    });

    it('должен маппить POST_IMAGE (2) в FileTypeDomain.POST_IMAGE', () => {
      const request: GenerateUploadUrlRequest = {
        ownerId: randomUUID(),
        fileExtension: '.png',
        fileType: 2,
        fileSize: 2048,
      };

      const dto = GrpcRequestMapper.generateUrlForUploadRequest(request);

      expect(dto.fileType).toBe(FileTypeDomain.POST_IMAGE);
    });

    it('должен маппить DOCUMENT (3) в FileTypeDomain.DOCUMENT', () => {
      const request: GenerateUploadUrlRequest = {
        ownerId: randomUUID(),
        fileExtension: '.pdf',
        fileType: 3,
        fileSize: 4096,
      };

      const dto = GrpcRequestMapper.generateUrlForUploadRequest(request);

      expect(dto.fileType).toBe(FileTypeDomain.DOCUMENT);
    });

    it('должен маппить MEDIA (4) в FileTypeDomain.MEDIA', () => {
      const request: GenerateUploadUrlRequest = {
        ownerId: randomUUID(),
        fileExtension: '.mp4',
        fileType: 4,
        fileSize: 10240,
      };

      const dto = GrpcRequestMapper.generateUrlForUploadRequest(request);

      expect(dto.fileType).toBe(FileTypeDomain.MEDIA);
    });

    it('должен использовать POST_IMAGE по умолчанию для неизвестного типа', () => {
      const request: GenerateUploadUrlRequest = {
        ownerId: randomUUID(),
        fileExtension: '.jpg',
        fileType: 999,
        fileSize: 1024,
      };

      const dto = GrpcRequestMapper.generateUrlForUploadRequest(request);

      expect(dto.fileType).toBe(FileTypeDomain.POST_IMAGE);
    });
  });

  describe('GrpcResponseMapper', () => {
    it('должен маппить FileEntity[] в GetFilesDataResponse', () => {
      const file1 = FileEntity.createNew({
        fileExtension: '.jpg',
        userId: randomUUID(),
        fileType: FileTypeDomain.AVATAR,
        region: 'eu-central-1',
      });
      file1.setS3Props('avatar/key1', 'avatar-bucket');

      const result = GrpcResponseMapper.getFilesDataResponse([file1]);

      expect(result.files[file1.id]).toEqual({
        fileId: file1.id,
        fileUrl: `https://avatar-bucket.s3.eu-central-1.amazonaws.com/avatar/key1`,
      });
    });

    it('должен обрабатывать пустой массив файлов', () => {
      const result = GrpcResponseMapper.getFilesDataResponse([]);

      expect(result.files).toEqual({});
    });
  });
});
