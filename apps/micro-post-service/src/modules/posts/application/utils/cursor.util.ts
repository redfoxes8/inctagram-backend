import { isUUID } from 'class-validator';
import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';

export class CursorPayload {
  id: string;
  createdAt: string;
}

export class CursorUtil {
  static encode(id: string, createdAt: Date): string {
    const payload: CursorPayload = {
      id,
      createdAt: createdAt.toISOString(),
    };
    const json = JSON.stringify(payload);
    return Buffer.from(json).toString('base64url');
  }

  static decode(cursor: string): CursorPayload | null {
    let payload: CursorPayload;
    try {
      const json = Buffer.from(cursor, 'base64url').toString('utf8');
      payload = JSON.parse(json) as CursorPayload;
    } catch {
      throw new DomainException({
        message: 'Invalid cursor format',
        code: DomainExceptionCode.BadRequest,
      });
    }

    if (!payload.id || !payload.createdAt) {
      throw new DomainException({
        message: 'Invalid cursor. It must contain createdAt and Id fields',
        code: DomainExceptionCode.BadRequest,
      });
    }

    if (!isUUID(payload.id)) {
      throw new DomainException({
        message: 'Cursor Id must be a valid UUID',
        code: DomainExceptionCode.BadRequest,
      });
    }

    return payload;
  }
}
