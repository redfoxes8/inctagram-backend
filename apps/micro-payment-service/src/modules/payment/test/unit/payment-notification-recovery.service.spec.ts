import { PaymentNotificationRecoveryService } from '../../application/services/payment-notification-recovery.service';
import { IPaymentNotificationRecoveryRepository } from '../../domain/interfaces/payment-notification-schedule.repository.interface';
import { ProcessDuePaymentNotificationScheduleService } from '../../application/services/process-due-payment-notification-schedule.service';

describe('PaymentNotificationRecoveryService', () => {
  const config = { paymentNotificationRecoveryBatchSize: 20 };

  it('returns an empty result after one batch lookup', async () => {
    const repository: Pick<IPaymentNotificationRecoveryRepository, 'findDueIds'> = {
      findDueIds: jest.fn().mockResolvedValue([]),
    };
    const processor: Pick<ProcessDuePaymentNotificationScheduleService, 'process'> = {
      process: jest.fn(),
    };
    const service = new PaymentNotificationRecoveryService(
      config as never,
      repository as IPaymentNotificationRecoveryRepository,
      processor as ProcessDuePaymentNotificationScheduleService,
    );

    await expect(service.runOnce(new Date('2026-09-02T00:00:00.000Z'))).resolves.toEqual({
      claimed: 0,
      processed: 0,
      skipped: 0,
      failed: 0,
    });
    expect(repository.findDueIds).toHaveBeenCalledTimes(1);
    expect(processor.process).not.toHaveBeenCalled();
  });

  it('continues after an individual processing error', async () => {
    const repository: Pick<IPaymentNotificationRecoveryRepository, 'findDueIds'> = {
      findDueIds: jest.fn().mockResolvedValue(['first', 'second']),
    };
    const processor: Pick<ProcessDuePaymentNotificationScheduleService, 'process'> = {
      process: jest
        .fn()
        .mockRejectedValueOnce(new Error('transient'))
        .mockResolvedValueOnce('COMPLETED'),
    };
    const service = new PaymentNotificationRecoveryService(
      config as never,
      repository as IPaymentNotificationRecoveryRepository,
      processor as ProcessDuePaymentNotificationScheduleService,
    );

    await expect(service.runOnce()).resolves.toEqual({
      claimed: 2,
      processed: 1,
      skipped: 0,
      failed: 1,
    });
    expect(processor.process).toHaveBeenCalledTimes(2);
  });
});
