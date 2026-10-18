import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { ADMIN_IDLE_MS, ADMIN_TOUCH_MS } from '../domain/admin-clock';
import {
  AdminSessionRepository,
  type AdminSessionRecord,
} from '../domain/admin-session.repository';
import { adminStorageOperation } from './admin-storage-operation';

@Injectable()
export class PrismaAdminSessionRepository extends AdminSessionRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async replace(input: {
    session: AdminSessionRecord;
    previousTokenHash: string | null;
  }): Promise<void> {
    await adminStorageOperation(() =>
      this.prisma.$transaction(async (transaction) => {
        if (input.previousTokenHash) {
          await transaction.adminSession.updateMany({
            where: { tokenHash: input.previousTokenHash, revokedAt: null },
            data: { revokedAt: input.session.createdAt },
          });
        }
        await transaction.adminSession.create({ data: input.session });
      }),
    );
  }

  async findActiveAndTouch(input: {
    tokenHash: string;
    now: Date;
  }): Promise<AdminSessionRecord | null> {
    return adminStorageOperation(async () => {
      const active = {
        tokenHash: input.tokenHash,
        revokedAt: null,
        idleExpiresAt: { gt: input.now },
        absoluteExpiresAt: { gt: input.now },
      };
      const session = await this.prisma.adminSession.findFirst({ where: active });
      if (!session) return null;
      if (session.lastSeenAt.getTime() <= input.now.getTime() - ADMIN_TOUCH_MS) {
        await this.prisma.adminSession.updateMany({
          where: { ...active, lastSeenAt: { lte: new Date(input.now.getTime() - ADMIN_TOUCH_MS) } },
          data: {
            lastSeenAt: input.now,
            idleExpiresAt: new Date(
              Math.min(input.now.getTime() + ADMIN_IDLE_MS, session.absoluteExpiresAt.getTime()),
            ),
          },
        });
        // Re-read after a lost race: an update may never revive a concurrently revoked/expired row.
        return this.prisma.adminSession.findFirst({ where: active });
      }
      return session;
    });
  }

  async revoke(input: { tokenHash: string; now: Date }): Promise<void> {
    await adminStorageOperation(() =>
      this.prisma.adminSession.updateMany({
        where: { tokenHash: input.tokenHash, revokedAt: null },
        data: { revokedAt: input.now },
      }),
    );
  }
}
