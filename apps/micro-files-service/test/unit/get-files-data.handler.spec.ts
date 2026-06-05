import { Test, TestingModule } from '@nestjs/testing';
import {
  GetFilesDataQuery,
  GetFilesDataHandler,
} from '../../src/modules/files/application/queries/get-files-data.query';
import { IFilesQueryRepository } from '../../src/modules/files/domain/interfaces/files.query-repository.interface';
import { FileEntity } from '../../src/modules/files/domain/file.entity';
import { FileTypeDomain } from '../../src/modules/files/domain/file.types';
import { randomUUID } from 'crypto';
import { DomainException } from '../../../../libs/common/src/exceptions/domain-exception';

describe('GetFilesDataHandler - Unit Tests', () => {
  let handler: GetFilesDataHandler;
  let queryRepository: jest.Mocked<IFilesQueryRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetFilesDataHandler,
        {
          provide: IFilesQueryRepository,
          useValue: {
            getFilesByIds: jest.fn(),
          },
        },
      ],
    }).compile();

    handler = module.get<GetFilesDataHandler>(GetFilesDataHandler);
    queryRepository = module.get(IFilesQueryRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('должен возвращать массив FileEntity если файлы найдены', async () => {
      const file = FileEntity.createNew({
        fileExtension: '.jpg',
        userId: randomUUID(),
        fileType: FileTypeDomain.AVATAR,
        region: 'eu-central-1',
      });
      file.setS3Props('key', 'bucket');
      queryRepository.getFilesByIds.mockResolvedValue([file]);

      const result = await handler.execute(new GetFilesDataQuery({ fileIds: [file.id] }));

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(file.id);
    });

    it('должен выбрасывать DomainException если файлы не найдены', async () => {
      queryRepository.getFilesByIds.mockResolvedValue(null);

      await expect(
        handler.execute(new GetFilesDataQuery({ fileIds: ['nonexistent'] })),
      ).rejects.toThrow(DomainException);
    });
  });
});
