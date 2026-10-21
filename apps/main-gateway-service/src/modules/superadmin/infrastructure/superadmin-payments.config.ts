import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { resolveSuperadminSetting, SUPERADMIN_CONFIG_DEFAULTS } from './superadmin-config-defaults';

@Injectable()
export class SuperadminPaymentsConfig {
  private readonly configuredTimeout: unknown;

  constructor(config: ConfigService) {
    this.configuredTimeout = resolveSuperadminSetting({
      value: config.get<unknown>('SUPERADMIN_PAYMENTS_TIMEOUT_MS'),
      fallback: SUPERADMIN_CONFIG_DEFAULTS.paymentsTimeoutMs,
    });
  }

  get timeoutMs(): number {
    const raw = this.configuredTimeout;
    const value =
      typeof raw === 'number' || (typeof raw === 'string' && /^\d+$/.test(raw)) ? Number(raw) : NaN;
    if (Number.isInteger(value) && value >= 1 && value <= 30000) return value;
    // Invalid feature configuration fails closed without breaking unrelated REST startup.
    throw new DomainException({
      code: DomainExceptionCode.ServiceUnavailable,
      message: 'Payment history unavailable',
    });
  }
}
