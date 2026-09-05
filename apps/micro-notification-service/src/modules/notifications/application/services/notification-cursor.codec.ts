import { isUUID } from 'class-validator';

import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import type { NotificationHistoryCursor } from '../ports/notification-history.port';

type EncodedNotificationCursor = Readonly<{
  version: 1;
  createdAt: string;
  id: string;
}>;

export class NotificationCursorCodec {
  public static encode(cursor: NotificationHistoryCursor): string {
    return Buffer.from(
      JSON.stringify({ version: 1, createdAt: cursor.createdAt.toISOString(), id: cursor.id }),
      'utf8',
    ).toString('base64url');
  }

  public static decode(value: string): NotificationHistoryCursor {
    try {
      const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
      if (!this.isEncodedCursor(decoded)) throw this.invalidCursor();
      const createdAt = new Date(decoded.createdAt);
      if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== decoded.createdAt) {
        throw this.invalidCursor();
      }
      return { createdAt, id: decoded.id };
    } catch (error: unknown) {
      if (error instanceof DomainException) throw error;
      throw this.invalidCursor();
    }
  }

  private static isEncodedCursor(value: unknown): value is EncodedNotificationCursor {
    if (!this.isRecord(value)) return false;
    return value.version === 1 && typeof value.createdAt === 'string' && isUUID(value.id);
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private static invalidCursor(): DomainException {
    return new DomainException({
      code: DomainExceptionCode.BadRequest,
      message: 'Notification cursor is invalid',
    });
  }
}
