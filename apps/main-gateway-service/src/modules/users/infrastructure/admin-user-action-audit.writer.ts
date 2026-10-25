import { Injectable } from '@nestjs/common';
import type { AdminUserActionAuditEntry } from '../../../../../../libs/common/types/admin-user-action-audit';
import { requireGatewayTransaction } from '../../../core/prisma/transactions/require-gateway-transaction';
import { AdminUserActionAuditWriter } from '../domain/interfaces/admin-user-action-audit.writer';
import { assertAdminUserActionAudit } from './assert-admin-user-action-audit';
import { normalizeUserBanReason } from '../../../../../../libs/common/src/validation/normalize-user-ban-reason';

@Injectable()
export class PrismaAdminUserActionAuditWriter extends AdminUserActionAuditWriter {
  async append(input: {
    entry: AdminUserActionAuditEntry;
    transaction: unknown;
  }): Promise<{ auditId: string }> {
    assertAdminUserActionAudit(input.entry);
    const client = requireGatewayTransaction(input.transaction);
    const reason = normalizeUserBanReason(input.entry.reasonSnapshot);
    const { action, outcome, targetUserId, occurredAt, adminSessionId } = input.entry;
    const audit = await client.adminUserActionAudit.create({
      data: {
        action,
        outcome,
        targetUserId,
        occurredAt,
        adminSessionId,
        banReasonCode: reason?.code ?? null,
        banReasonText: reason?.text ?? null,
      },
      select: { id: true },
    });
    return { auditId: audit.id };
  }
}
