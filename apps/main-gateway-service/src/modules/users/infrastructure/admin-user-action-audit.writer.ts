import { Injectable } from '@nestjs/common';
import type { AdminUserActionAuditEntry } from '../../../../../../libs/common/types/admin-user-action-audit';
import { requireGatewayTransaction } from '../../../core/prisma/transactions/require-gateway-transaction';
import { AdminUserActionAuditWriter } from '../domain/interfaces/admin-user-action-audit.writer';
import { assertAdminUserActionAudit } from './assert-admin-user-action-audit';

@Injectable()
export class PrismaAdminUserActionAuditWriter extends AdminUserActionAuditWriter {
  async append(input: {
    entry: AdminUserActionAuditEntry;
    transaction: unknown;
  }): Promise<{ auditId: string }> {
    assertAdminUserActionAudit(input.entry);
    const client = requireGatewayTransaction(input.transaction);
    const { action, outcome, targetUserId, occurredAt, adminSessionId } = input.entry;
    const audit = await client.adminUserActionAudit.create({
      data: { action, outcome, targetUserId, occurredAt, adminSessionId },
      select: { id: true },
    });
    return { auditId: audit.id };
  }
}
