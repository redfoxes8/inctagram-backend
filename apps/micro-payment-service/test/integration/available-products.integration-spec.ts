import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../src/core/prisma/client';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { ProductRepository } from '../../src/modules/payment/infrastructure/repositories/product.repository';

const DATABASE_URL = process.env.PAYMENT_LIFECYCLE_TEST_DB_URL;
const IDS = {
  week: '91000000-0000-4000-8000-000000000001',
  month: '91000000-0000-4000-8000-000000000002',
  inactive: '91000000-0000-4000-8000-000000000003',
  unmapped: '91000000-0000-4000-8000-000000000004',
};

const describeWithDatabase = DATABASE_URL ? describe : describe.skip;

describeWithDatabase('Available products PostgreSQL integration', () => {
  let client: PrismaClient;
  let selectCount = 0;

  beforeAll(async () => {
    client = new PrismaClient({
      adapter: new PrismaPg({ connectionString: DATABASE_URL }),
      log: [{ emit: 'event', level: 'query' }],
    });
    client.$on('query', (event) => {
      if (event.query.toLowerCase().includes('select')) selectCount += 1;
    });
    await client.$connect();
    await client.productProvider.deleteMany({ where: { productId: { in: Object.values(IDS) } } });
    await client.product.deleteMany({ where: { id: { in: Object.values(IDS) } } });
    await client.product.createMany({
      data: [
        {
          id: IDS.week,
          code: 'CATALOG_WEEK',
          name: 'Week',
          billingInterval: 'WEEK',
          billingIntervalCount: 1,
          priceMinor: 700,
          currency: 'USD',
        },
        {
          id: IDS.month,
          code: 'CATALOG_MONTH',
          name: 'Month',
          billingInterval: 'MONTH',
          billingIntervalCount: 1,
          priceMinor: 1200,
          currency: 'USD',
        },
        {
          id: IDS.inactive,
          code: 'CATALOG_INACTIVE',
          name: 'Inactive',
          billingInterval: 'WEEK',
          billingIntervalCount: 1,
          priceMinor: 1,
          currency: 'USD',
          isActive: false,
        },
        {
          id: IDS.unmapped,
          code: 'CATALOG_UNMAPPED',
          name: 'Unmapped',
          billingInterval: 'MONTH',
          billingIntervalCount: 1,
          priceMinor: 1,
          currency: 'USD',
        },
      ],
    });
    await client.productProvider.createMany({
      data: [IDS.week, IDS.month, IDS.inactive].map((productId, index) => ({
        id: `92000000-0000-4000-8000-00000000000${index + 1}`,
        productId,
        provider: 'STRIPE',
        providerProductId: `product_${index}`,
        providerBillingId: `price_${index}`,
        environment: 'test',
        isActive: true,
      })),
    });
  });

  afterAll(async () => {
    await client.productProvider.deleteMany({ where: { productId: { in: Object.values(IDS) } } });
    await client.product.deleteMany({ where: { id: { in: Object.values(IDS) } } });
    await client.$disconnect();
  });

  it('filters and orders purchasable products in one read without Outbox writes', async () => {
    const repository = new ProductRepository(client as unknown as PrismaService);
    const outboxBefore = await client.outboxEvent.count();
    selectCount = 0;

    const products = await repository.findPurchasable({ provider: 'STRIPE', environment: 'test' });

    expect(products.map(({ id }) => id)).toEqual([IDS.week, IDS.month]);
    expect(selectCount).toBe(1);
    expect(await client.outboxEvent.count()).toBe(outboxBefore);
  });
});
