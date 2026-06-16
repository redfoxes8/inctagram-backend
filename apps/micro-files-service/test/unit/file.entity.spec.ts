import { FileEntity } from '../../src/modules/files/domain/file.entity';
import { FileStatusDomain, FileTypeDomain } from '../../src/modules/files/domain/file.types';
import { DomainException } from '../../../../libs/common/src/exceptions/domain-exception';
import { randomUUID } from 'crypto';

describe('FileEntity - Unit Tests', () => {
  describe('createNew', () => {
    it('должен создавать сущность со статусом PENDING', () => {
      const entity = FileEntity.createNew({
        fileExtension: '.jpg',
        userId: randomUUID(),
        fileType: FileTypeDomain.AVATAR,
        region: 'eu-central-1',
      });

      expect(entity.getStatus()).toBe(FileStatusDomain.PENDING);
      expect(entity.getFileExtension()).toBe('.jpg');
      expect(entity.getFileType()).toBe(FileTypeDomain.AVATAR);
      expect(entity.getRegion()).toBe('eu-central-1');
    });
  });

  describe('setS3Props', () => {
    it('должен устанавливать s3Key и bucket', () => {
      const entity = FileEntity.createNew({
        fileExtension: '.jpg',
        userId: randomUUID(),
        fileType: FileTypeDomain.AVATAR,
        region: 'eu-central-1',
      });

      entity.setS3Props('my-key', 'my-bucket');

      expect(entity.getS3Key()).toBe('my-key');
      expect(entity.getBucket()).toBe('my-bucket');
    });
  });

  describe('updateStatus', () => {
    it('должен обновлять статус с PENDING на UPLOADED', () => {
      const entity = FileEntity.createNew({
        fileExtension: '.jpg',
        userId: randomUUID(),
        fileType: FileTypeDomain.AVATAR,
        region: 'eu-central-1',
      });

      entity.updateStatus(FileStatusDomain.UPLOADED);

      expect(entity.getStatus()).toBe(FileStatusDomain.UPLOADED);
    });

    it('должен выбрасывать DomainException при попытке вернуть статус PENDING из UPLOADED', () => {
      const entity = FileEntity.createNew({
        fileExtension: '.jpg',
        userId: randomUUID(),
        fileType: FileTypeDomain.AVATAR,
        region: 'eu-central-1',
      });

      entity.updateStatus(FileStatusDomain.UPLOADED);

      expect(() => entity.updateStatus(FileStatusDomain.PENDING)).toThrow(DomainException);
    });
  });

  describe('getS3Key', () => {
    it('должен выбрасывать DomainException если s3Key не установлен', () => {
      const entity = FileEntity.createNew({
        fileExtension: '.jpg',
        userId: randomUUID(),
        fileType: FileTypeDomain.AVATAR,
        region: 'eu-central-1',
      });

      expect(() => entity.getS3Key()).toThrow(DomainException);
    });
  });

  describe('getBucket', () => {
    it('должен выбрасывать DomainException если bucket не установлен', () => {
      const entity = FileEntity.createNew({
        fileExtension: '.jpg',
        userId: randomUUID(),
        fileType: FileTypeDomain.AVATAR,
        region: 'eu-central-1',
      });

      expect(() => entity.getBucket()).toThrow(DomainException);
    });
  });
});
