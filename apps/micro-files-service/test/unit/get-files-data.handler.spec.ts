import { Test, TestingModule } from '@nestjs/testing';
import {
  GetFilesDataQuery,
  GetFilesDataHandler,
} from '../../src/modules/files/application/queries/get-files-data.query';
import { IFilesQueryRepository } from '../../src/modules/files/domain/interfaces/files.query-repository.interface';
import { FileEntity } from '../../src/modules/files/domain/file.entity';
import { FileTypeDomain } from '../../src/modules/files/domain/file.types';
import { randomUUID } from 'crypto';

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
    it('should return array of FileEntity when files are found', async () => {
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

    it('should return an empty array when files are not found', async () => {
      queryRepository.getFilesByIds.mockResolvedValue([]);

      await expect(
        handler.execute(new GetFilesDataQuery({ fileIds: ['nonexistent'] })),
      ).resolves.toEqual([]);
    });
  });
});
