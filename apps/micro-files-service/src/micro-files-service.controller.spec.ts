import { Test, TestingModule } from '@nestjs/testing';
import { MicroFilesServiceController } from './micro-files-service.controller';
import { MicroFilesServiceService } from './micro-files-service.service';

describe('MicroFilesServiceController', () => {
  let microFilesServiceController: MicroFilesServiceController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [MicroFilesServiceController],
      providers: [MicroFilesServiceService],
    }).compile();

    microFilesServiceController = app.get<MicroFilesServiceController>(MicroFilesServiceController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(microFilesServiceController.getHello()).toBe('Hello World!');
    });
  });
});
