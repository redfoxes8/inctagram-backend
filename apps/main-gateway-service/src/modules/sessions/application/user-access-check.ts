import { Injectable } from '@nestjs/common';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';

export type UserAccessCredential = { userId: string; deviceId: string; exp: number };
export type VerifiedUserSession = { sessionId: string };

export abstract class UserAccessSessionQuery {
  abstract findActive(
    input: UserAccessCredential & { now: Date },
  ): Promise<VerifiedUserSession | null>;
}

@Injectable()
export class UserAccessClock {
  now(): Date {
    return new Date();
  }
}

@Injectable()
export class UserAccessCheck {
  constructor(
    private readonly sessions: UserAccessSessionQuery,
    private readonly clock: UserAccessClock,
  ) {}

  async verify(input: UserAccessCredential): Promise<VerifiedUserSession> {
    const now = this.clock.now();
    if (
      typeof input.userId !== 'string' ||
      !input.userId ||
      typeof input.deviceId !== 'string' ||
      !input.deviceId ||
      !Number.isSafeInteger(input.exp) ||
      input.exp <= Math.floor(now.getTime() / 1000)
    ) {
      throw this.denied();
    }
    try {
      const session = await this.sessions.findActive({ ...input, now });
      if (session) return session;
    } catch {
      throw new DomainException({
        code: DomainExceptionCode.ServiceUnavailable,
        message: 'Service unavailable',
      });
    }
    throw this.denied();
  }

  private denied(): DomainException {
    return new DomainException({ code: DomainExceptionCode.Unauthorized, message: 'Unauthorized' });
  }
}
