import { Injectable } from '@nestjs/common';

import { NotificationCleanupRepository } from '../../infrastructure/repositories/notification-cleanup.repository';

export type NotificationCleanupResult = Readonly<{
  batches: number;
  deleted: number;
  durationMs: number;
}>;

@Injectable()
export class NotificationCleanupService {
  constructor(private readonly repository: NotificationCleanupRepository) {}

  public async runOnce(input: {
    retentionDays: number;
    batchSize: number;
    maxBatchesPerRun: number;
  }): Promise<NotificationCleanupResult> {
    const startedAt = Date.now();
    let batches = 0;
    let deleted = 0;
    while (batches < input.maxBatchesPerRun) {
      const deletedCount = await this.repository.deleteExpired(input);
      batches += 1;
      deleted += deletedCount;
      if (deletedCount === 0 || deletedCount < input.batchSize) break;
    }
    return { batches, deleted, durationMs: Date.now() - startedAt };
  }
}
