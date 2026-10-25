import { IsolatedAdminDatabase } from './isolated-admin-database';
import { createIsolatedPaymentDatabase } from './isolated-payment-database';
import type { PrismaService } from '../../src/core/prisma/prisma.service';
import type { PrismaService as PaymentPrismaService } from '../../../micro-payment-service/src/core/prisma/prisma.service';
import type { PrismaClient as PaymentClient } from '../../../micro-payment-service/src/core/prisma/client';
import type { PaymentConfig } from '../../../micro-payment-service/src/core/payment.config';
import { SuperadminPaymentsQueryRepository } from '../../../micro-payment-service/src/modules/payment/infrastructure/repositories/superadmin-payments.query-repository';
import {
  GetSuperadminPaymentsPageQuery,
  GetSuperadminPaymentsPageHandler,
} from '../../../micro-payment-service/src/modules/payment/application/queries/get-superadmin-payments-page.query';
import { PaymentPageProfilesQueryRepository } from '../../src/modules/superadmin/infrastructure/payment-page-profiles.query-repository';
import { EnrichSuperadminPaymentsPageQuery } from '../../src/modules/superadmin/application/enrich-superadmin-payments-page';
import { PaymentQueryRepository } from '../../../micro-payment-service/src/modules/payment/infrastructure/repositories/payment-query.repository';
import {
  SuperadminPaymentsSort,
  type SuperadminPaymentsInput,
  type SuperadminPaymentRecord,
} from '../../../../libs/common/types/superadmin-payments-list';
import { DomainExceptionCode } from '../../../../libs/common/src/exceptions/domain-exception-codes';

const SYNC_ID = 'payment-user-profile-v1';
const PRODUCT_ID = '10000000-0000-4000-8000-000000000001';
const USER_IDS = Array.from(
  { length: 8 },
  (_, index) => `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
);
const NAMES = ['Alpha', 'Beta', null, 'Gamma', 'Delta', null, null, 'Literal%_User'];
const STATUSES = [
  'PENDING',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
] as const;
function transactionId(index: number): string {
  return `30000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}
function subscriptionId(index: number): string {
  return `40000000-0000-4000-8000-${String(index % 8).padStart(12, '0')}`;
}
const TRANSACTIONS = Array.from({ length: 14 }, (_, index) => ({
  id: transactionId(index),
  userId: USER_IDS[index % 8],
  productId: PRODUCT_ID,
  provider: index % 2 === 0 ? 'STRIPE' : 'PAYPAL',
  kind: 'RENEWAL' as const,
  status: STATUSES[index % STATUSES.length],
  subscriptionId: [2, 4, 5].includes(index % 6) ? subscriptionId(index) : null,
  providerTransactionId: [2, 4, 5].includes(index % 6) ? `fixture-provider-${index}` : null,
  providerInvoiceId: `fixture-invoice-${index}`,
  paidAt: [2, 4, 5].includes(index % 6) ? new Date('2026-10-25T00:00:00Z') : null,
  refundedAt: [4, 5].includes(index % 6) ? new Date('2026-10-26T00:00:00Z') : null,
  failureCode: index % 6 === 3 ? 'fixture_failure' : null,
  amountMinor: [100, 20, 3000, 5, 5000][Math.floor(index / 3)],
  currency: index % 2 === 0 ? 'EUR' : 'USD',
  createdAt: new Date(Date.UTC(2026, 9, 25, 0, 0, Math.floor(index / 2))),
  idempotencyKey: `read-page-fixture-${index}`,
}));

describe('P1e internal payments read/enrichment on isolated Gateway and Payment PostgreSQL', () => {
  jest.setTimeout(120000);
  const database = new IsolatedAdminDatabase();
  let gateway: PrismaService;
  let payment: PaymentClient;
  let repository: SuperadminPaymentsQueryRepository;
  let query: GetSuperadminPaymentsPageHandler;
  let profiles: PaymentPageProfilesQueryRepository;
  const config = { userProjectionSyncEnabled: true } as PaymentConfig;
  function read(
    input: SuperadminPaymentsInput = {},
  ): ReturnType<GetSuperadminPaymentsPageHandler['execute']> {
    return query.execute(new GetSuperadminPaymentsPageQuery(input));
  }
  async function all(sort: SuperadminPaymentsSort): Promise<SuperadminPaymentRecord[]> {
    const items: SuperadminPaymentRecord[] = [];
    for (const page of [1, 2, 3]) items.push(...(await read({ page, sort })).items);
    return items;
  }
  beforeAll(async () => {
    await database.start();
    gateway = database.client();
    payment = createIsolatedPaymentDatabase(database);
    repository = new SuperadminPaymentsQueryRepository(payment as PaymentPrismaService, config);
    query = new GetSuperadminPaymentsPageHandler(repository);
    profiles = new PaymentPageProfilesQueryRepository(gateway);
    const collation = await payment.$queryRaw<{ datcollate: string; datctype: string }[]>`
      SELECT datcollate, datctype FROM pg_database WHERE datname = current_database()
    `;
    console.info('Isolated Payment PostgreSQL collation:', collation[0]);
    await gateway.user.deleteMany();
    await gateway.user.createMany({
      data: USER_IDS.filter((_, index) => index !== 4 && index !== 6).map((id, index) => ({
        id,
        email: `payment-page-${index}@example.test`,
      })),
    });
    await gateway.user.updateMany({
      where: { id: { in: [USER_IDS[3], USER_IDS[5]] } },
      data: { deletedAt: new Date() },
    });
    await gateway.profile.createMany({
      data: [0, 1, 3, 5, 7].map((index) => ({
        userId: USER_IDS[index],
        username: `FreshName${index}`,
        avatarUrl: index === 7 ? null : `https://avatar.example.test/${index}`,
      })),
    });
    await payment.product.create({
      data: {
        id: PRODUCT_ID,
        code: 'PAGE_FIXTURE',
        name: 'Current product',
        billingInterval: 'MONTH',
        billingIntervalCount: 3,
        priceMinor: 500,
        currency: 'EUR',
      },
    });
    await payment.subscription.createMany({
      data: USER_IDS.map((userId, index) => ({
        id: subscriptionId(index),
        userId,
        productId: PRODUCT_ID,
        sequence: 1,
        provider: index % 2 === 0 ? 'STRIPE' : 'PAYPAL',
        status: 'ACTIVE',
        autoRenew: false,
        startsAt: new Date('2026-10-25T00:00:00Z'),
        endsAt: new Date('2027-01-25T00:00:00Z'),
      })),
    });
    await payment.paymentTransaction.createMany({ data: TRANSACTIONS });
    await payment.adminUserProfileReadModel.createMany({
      data: USER_IDS.filter((_, index) => index !== 6).map((userId) => {
        const index = USER_IDS.indexOf(userId);
        return {
          userId,
          sourceVersion: 9007199254740993n,
          username: NAMES[index],
          profileExists: index !== 2,
          isDeleted: index === 5,
        };
      }),
    });
  });
  beforeEach(async () => {
    jest.restoreAllMocks();
    await payment.adminUserProjectionSync.update({
      where: { id: SYNC_ID },
      data: { phase: 'READY', mode: 'IDLE' },
    });
  });
  afterAll(async () => {
    await payment?.$disconnect();
    await database.stop();
  });

  it('fixed-six defaults, all statuses and current product facts; preserves count on empty/out-of-range pages', async () => {
    const call = jest.spyOn(payment, '$queryRaw');
    const first = await read();
    expect(call).toHaveBeenCalledTimes(1);
    expect(first.pageInfo).toEqual({ page: 1, pageSize: 6, pagesCount: 3, hasNextPage: true });
    expect(first.totalCount).toBe(14);
    expect(first.items.map((item) => item.transactionId)).toEqual(
      TRANSACTIONS.slice(8)
        .reverse()
        .map((item) => item.id),
    );
    expect(first.items[0]).toMatchObject({
      productName: 'Current product',
      billingInterval: 'MONTH',
      billingIntervalCount: 3,
      amountMinor: 5000,
      currency: 'USD',
      provider: 'PAYPAL',
    });
    expect(
      new Set((await all(SuperadminPaymentsSort.CreatedAtDesc)).map((item) => item.status)),
    ).toEqual(new Set(STATUSES));
    expect(await read({ page: 3 })).toMatchObject({
      totalCount: 14,
      pageInfo: { page: 3, hasNextPage: false },
    });
    expect(await read({ page: 10000 })).toEqual({
      items: [],
      totalCount: 14,
      pageInfo: { page: 10000, pageSize: 6, pagesCount: 3, hasNextPage: false },
    });
    expect(await read({ searchUsername: 'No_matching_name' })).toEqual({
      items: [],
      totalCount: 0,
      pageInfo: { page: 1, pageSize: 6, pagesCount: 0, hasNextPage: false },
    });
    expect((await read()).items[0].userSnapshot?.sourceVersion).toBe('9007199254740993');
  });

  it('literal search is trimmed/case-insensitive and applied before pagination, not to a selected page', async () => {
    const combined = await read({
      searchUsername: ' a ',
      page: 2,
      sort: SuperadminPaymentsSort.CreatedAtAsc,
    });
    const matching = TRANSACTIONS.filter((item) =>
      NAMES[USER_IDS.indexOf(item.userId)]?.toLowerCase().includes('a'),
    );
    expect(combined.totalCount).toBe(matching.length);
    expect(combined.items.map((item) => item.transactionId)).toEqual(
      matching.slice(6, 12).map((item) => item.id),
    );
    for (const searchUsername of ['%', '_', '%_', 'literal%_uSER']) {
      const result = await read({ searchUsername });
      expect(result.totalCount).toBe(1);
      expect(result.items.map((item) => item.userId)).toEqual([USER_IDS[7]]);
    }
    expect((await read({ searchUsername: "x' OR 1=1 --" })).totalCount).toBe(0);
    expect((await read({ searchUsername: '  ' })).totalCount).toBe(14);
  });

  it.each(Object.values(SuperadminPaymentsSort))(
    '%s sorts globally with ID ties and username null-last',
    async (sort) => {
      const direction = sort.endsWith('_ASC') ? 1 : -1;
      const ranks: Record<string, number> = {
        Alpha: 0,
        Beta: 1,
        Delta: 2,
        Gamma: 3,
        'Literal%_User': 4,
      };
      const expected = [...TRANSACTIONS].sort((left, right) => {
        let comparison = 0;
        if (sort.startsWith('USERNAME')) {
          const leftName = NAMES[USER_IDS.indexOf(left.userId)];
          const rightName = NAMES[USER_IDS.indexOf(right.userId)];
          if (leftName === null && rightName !== null) return 1;
          if (leftName !== null && rightName === null) return -1;
          if (leftName !== null && rightName !== null)
            comparison = ranks[leftName] - ranks[rightName];
        } else if (sort.startsWith('CREATED_AT'))
          comparison = left.createdAt.getTime() - right.createdAt.getTime();
        else if (sort.startsWith('AMOUNT')) comparison = left.amountMinor - right.amountMinor;
        else
          comparison = left.provider === right.provider ? 0 : left.provider === 'PAYPAL' ? -1 : 1;
        return direction * (comparison || left.id.localeCompare(right.id));
      });
      expect((await all(sort)).map((item) => item.transactionId)).toEqual(
        expected.map((item) => item.id),
      );
    },
  );

  it('NOT_READY/LOADING/missing singleton/disabled are errors, while READY reconciliation stays readable', async () => {
    for (const phase of ['NOT_READY', 'LOADING'] as const) {
      await payment.adminUserProjectionSync.update({ where: { id: SYNC_ID }, data: { phase } });
      await expect(read()).rejects.toMatchObject({ code: DomainExceptionCode.ServiceUnavailable });
    }
    await payment.adminUserProjectionSync.delete({ where: { id: SYNC_ID } });
    try {
      await expect(read()).rejects.toMatchObject({ code: DomainExceptionCode.ServiceUnavailable });
    } finally {
      await payment.adminUserProjectionSync.create({
        data: { id: SYNC_ID, phase: 'READY', mode: 'RECONCILE' },
      });
    }
    expect((await read()).totalCount).toBe(14);
    const disabled = new GetSuperadminPaymentsPageHandler(
      new SuperadminPaymentsQueryRepository(
        payment as PaymentPrismaService,
        { userProjectionSyncEnabled: false } as PaymentConfig,
      ),
    );
    await expect(disabled.execute(new GetSuperadminPaymentsPageQuery({}))).rejects.toMatchObject({
      code: DomainExceptionCode.ServiceUnavailable,
    });
  });

  it('one batch enriches avatars, suppresses current missing/deleted, retains snapshot name/order/count', async () => {
    const page = await read({ sort: SuperadminPaymentsSort.CreatedAtAsc });
    const before = structuredClone(page);
    const call = jest.spyOn(gateway, '$queryRaw');
    const enriched = await new EnrichSuperadminPaymentsPageQuery(profiles).execute(page);
    expect(call).toHaveBeenCalledTimes(1);
    expect(enriched.totalCount).toBe(page.totalCount);
    expect(enriched.pageInfo).toBe(page.pageInfo);
    expect(enriched.items.map((item) => item.transactionId)).toEqual(
      page.items.map((item) => item.transactionId),
    );
    expect(page).toEqual(before);
    expect(enriched.items[0]).toMatchObject({
      username: 'Alpha',
      avatarUrl: 'https://avatar.example.test/0',
    });
    expect(enriched.items[2]).toMatchObject({ username: null, avatarUrl: null }); // Profile absent.
    for (const index of [3, 4, 5])
      expect(enriched.items[index]).toMatchObject({ username: null, avatarUrl: null });
    const remaining = await new EnrichSuperadminPaymentsPageQuery(profiles).execute(
      await read({ page: 2, sort: SuperadminPaymentsSort.CreatedAtAsc }),
    );
    expect(remaining.items[0]).toMatchObject({
      userId: USER_IDS[6],
      username: null,
      avatarUrl: null,
    }); // Missing source + projection is retained.
    expect(remaining.items[1]).toMatchObject({ username: 'Literal%_User', avatarUrl: null });
    expect((await read({ searchUsername: 'Gamma' })).totalCount).toBe(2); // Stale count/search intentionally remain.
    // Controlled deletion between Payment snapshot and Gateway SELECT; no concurrent sleeps.
    await gateway.user.update({ where: { id: USER_IDS[0] }, data: { deletedAt: new Date() } });
    try {
      const afterDelete = await new EnrichSuperadminPaymentsPageQuery(profiles).execute(page);
      expect(afterDelete.items[0]).toMatchObject({ username: null, avatarUrl: null });
      expect(afterDelete.totalCount).toBe(page.totalCount);
    } finally {
      await gateway.user.update({ where: { id: USER_IDS[0] }, data: { deletedAt: null } });
    }
  });

  it('live user without projection is a sync gap; storage failure is not a missing Profile', async () => {
    const page = await read({ searchUsername: 'Alpha' });
    page.items[0] = { ...page.items[0], userSnapshot: null };
    await expect(
      new EnrichSuperadminPaymentsPageQuery(profiles).execute(page),
    ).rejects.toMatchObject({ code: DomainExceptionCode.ServiceUnavailable });
    await expect(profiles.findProfiles([...USER_IDS])).rejects.toMatchObject({
      code: DomainExceptionCode.InternalServerError,
    });
    expect(await profiles.findProfiles([])).toEqual([]);
    // Rename only this isolated fixture table to cause a real PostgreSQL storage error.
    await gateway.$executeRawUnsafe('ALTER TABLE "Profile" RENAME TO "fixture_hidden_profile"');
    try {
      await expect(profiles.findProfiles([USER_IDS[0]])).rejects.toMatchObject({
        code: DomainExceptionCode.ServiceUnavailable,
      });
    } finally {
      await gateway.$executeRawUnsafe('ALTER TABLE "fixture_hidden_profile" RENAME TO "Profile"');
    }
  });

  it('validates page/search/sort before storage and leaves the selected-user history unchanged', async () => {
    const call = jest.spyOn(repository, 'findPage');
    for (const input of [
      { page: 0 },
      { page: 10001 },
      { page: 1.5 },
      { searchUsername: 'a'.repeat(101) },
      { sort: 'INVALID' },
    ]) {
      await expect(read(input as SuperadminPaymentsInput)).rejects.toMatchObject({
        code: DomainExceptionCode.BadRequest,
      });
    }
    expect(call).not.toHaveBeenCalled();
    expect((await read({ searchUsername: ' '.repeat(2) + 'a'.repeat(100) + ' ' })).totalCount).toBe(
      0,
    );
    const history = await new PaymentQueryRepository(
      payment as PaymentPrismaService,
    ).getPaymentHistory({ userId: USER_IDS[0], page: { page: 1, pageSize: 8 } });
    expect(history.totalCount).toBe(2);
    expect(history.items.map((item) => item.transactionId)).toEqual([
      transactionId(8),
      transactionId(0),
    ]);
    expect(history.pageSize).toBe(8);
  });
});
