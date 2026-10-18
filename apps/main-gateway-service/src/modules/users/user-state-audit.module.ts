import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { UserAccessStateQuery } from './domain/interfaces/user-access-state.query';
import { AdminUserActionAuditWriter } from './domain/interfaces/admin-user-action-audit.writer';
import { PrismaUserAccessStateQuery } from './infrastructure/user-access-state.query';
import { PrismaAdminUserActionAuditWriter } from './infrastructure/admin-user-action-audit.writer';
import { ITransactionManager } from '../../common/interfaces/transaction-manager.interface';
import { PrismaTransactionManager } from '../../core/prisma/transactions/prisma.transaction.manager';

// Importable by 03/4B/05 without starting UsersModule's unrelated RPC/outbox providers.
@Module({
  imports: [PrismaModule],
  providers: [
    { provide: ITransactionManager, useClass: PrismaTransactionManager },
    { provide: UserAccessStateQuery, useClass: PrismaUserAccessStateQuery },
    { provide: AdminUserActionAuditWriter, useClass: PrismaAdminUserActionAuditWriter },
  ],
  exports: [UserAccessStateQuery, AdminUserActionAuditWriter, ITransactionManager],
})
export class UserStateAuditModule {}
