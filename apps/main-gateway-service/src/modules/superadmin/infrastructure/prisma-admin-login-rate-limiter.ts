import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { ADMIN_LOGIN_ATTEMPTS, ADMIN_LOGIN_WINDOW_MS } from '../domain/admin-clock';
import { AdminLoginRateLimiter } from '../domain/admin-session.repository';
import { adminStorageOperation } from './admin-storage-operation';

@Injectable()
export class PrismaAdminLoginRateLimiter extends AdminLoginRateLimiter {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async consume(input: { keyHash: string; now: Date }): Promise<boolean> {
    return adminStorageOperation(() =>
      this.prisma.$transaction(async (transaction) => {
        const lockKey = BigInt.asIntN(64, BigInt('0x' + input.keyHash.slice(0, 16)));
        // Transaction-scoped PostgreSQL lock serializes the same IP/account across Gateway pods.
        await transaction.$queryRaw`SELECT pg_advisory_xact_lock(${lockKey})::text`;
        const previous = await transaction.adminLoginRateLimit.findUnique({
          where: { keyHash: input.keyHash },
        });
        const attempts = (previous?.attempts ?? []).filter(
          (attempt) => attempt.getTime() > input.now.getTime() - ADMIN_LOGIN_WINDOW_MS,
        );
        if (attempts.length >= ADMIN_LOGIN_ATTEMPTS) return false;
        attempts.push(input.now);
        await transaction.adminLoginRateLimit.upsert({
          where: { keyHash: input.keyHash },
          create: { keyHash: input.keyHash, attempts, updatedAt: input.now },
          update: { attempts, updatedAt: input.now },
        });
        return true;
      }),
    );
  }
}
