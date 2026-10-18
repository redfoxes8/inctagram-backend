import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import {
  UserAccessSessionQuery,
  type UserAccessCredential,
  type VerifiedUserSession,
} from '../application/user-access-check';

@Injectable()
export class PrismaUserAccessSessionQuery extends UserAccessSessionQuery {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findActive(
    input: UserAccessCredential & { now: Date },
  ): Promise<VerifiedUserSession | null> {
    // Session.exp is REFRESH expiry in Unix seconds, not access-token exp or milliseconds.
    const rows = await this.prisma.$queryRaw<VerifiedUserSession[]>`
      SELECT session."id" AS "sessionId" FROM "Session" session JOIN "User" account ON account."id" = session."userId"
      WHERE account."id" = ${input.userId} AND account."deletedAt" IS NULL AND account."isBanned" = false
        AND session."deviceId" = ${input.deviceId} AND session."deletedAt" IS NULL
        AND session."exp" > ${Math.floor(input.now.getTime() / 1000)}`;
    return rows[0] ?? null;
  }
}
