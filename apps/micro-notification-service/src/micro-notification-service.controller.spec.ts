import { Test, TestingModule } from '@nestjs/testing';
import { MicroNotificationServiceController } from './micro-notification-service.controller';
import { MicroNotificationServiceService } from './micro-notification-service.service';

describe('MicroNotificationServiceController', () => {
  let microNotificationServiceController: MicroNotificationServiceController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [MicroNotificationServiceController],
      providers: [MicroNotificationServiceService],
    }).compile();

    microNotificationServiceController = app.get<MicroNotificationServiceController>(MicroNotificationServiceController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(microNotificationServiceController.getHello()).toBe('Hello World!');
    });
  });
});
