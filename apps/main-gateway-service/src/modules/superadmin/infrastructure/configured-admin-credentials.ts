import { Injectable } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { AdminCredentials } from '../domain/admin-session.repository';
import { AdminAuthConfig } from './admin-auth.config';

@Injectable()
export class ConfiguredAdminCredentials extends AdminCredentials {
  constructor(private readonly config: AdminAuthConfig) {
    super();
  }

  async matches(input: { email: string; password: string }): Promise<boolean> {
    if (!this.config.enabled) {
      throw new DomainException({
        code: DomainExceptionCode.ServiceUnavailable,
        message: 'Service unavailable',
      });
    }
    // Always perform bcrypt comparison, including a wrong email (one safe error/timing shape).
    const passwordMatches = await bcrypt.compare(input.password, this.config.passwordHash);
    return (
      input.email === this.config.email &&
      passwordMatches &&
      Buffer.byteLength(input.password) <= 72
    );
  }
}
