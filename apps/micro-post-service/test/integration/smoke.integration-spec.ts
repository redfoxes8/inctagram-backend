import path from 'path';
import { createTestApp } from '../test-app.factory';
import { PostsModule } from '../../src/modules/posts/posts.module';
import { prepareTestDatabase, resetTestDatabase } from '../reset-db';
import { PrismaService } from '../../src/core/prisma/prisma.service';
import { validateTestDatabaseEnvironment } from '../validate-test-db-environment';
import { Client } from 'pg';

jest.setTimeout(120000);

describe('Infrastructure smoke test', () => {
  let module: any;
  let prisma: PrismaService;

  it('bootstraps app, connects prisma, runs migrations and shuts down gracefully', async () => {
    // validate DB environment before starting application (test-only validation)
    validateTestDatabaseEnvironment(process.env.DATABASE_URL);

    module = await createTestApp(
      { imports: [PostsModule] },
      {
        PORT: '3004',
        GRPC_PORT: '50052',
        RABBITMQ_URL: 'amqp://localhost',
        FILE_SERVICE_GRPC_URL: 'localhost:50052',
      },
    );
    prisma = module.get(PrismaService);

    // ensure prisma connect (onModuleInit triggers automatic connect)
    await prisma.$connect();

    // prepare DB (migrations)
    await prepareTestDatabase({
      prismaConfigPath: path.resolve(
        process.cwd(),
        'apps/micro-post-service/prisma/prisma.config.ts',
      ),
    });

    // run a simple query
    const res = await prisma.$queryRaw`SELECT 1 as v`;
    expect(res).toBeDefined();

    await prisma.$disconnect();
    await module.close();

    // reset DB content deterministically
    await resetTestDatabase();

    // verify cleanup by connecting a fresh client to DB
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      const r = await client.query('SELECT 1 as v');
      expect(r.rows[0].v).toBe(1);
    } finally {
      await client.end();
    }

    // verify we can bootstrap again (reconnect)
    const module2 = await createTestApp(
      { imports: [PostsModule] },
      {
        PORT: '3004',
        GRPC_PORT: '50052',
        RABBITMQ_URL: 'amqp://localhost',
        FILE_SERVICE_GRPC_URL: 'localhost:50052',
      },
    );
    const prisma2 = module2.get(PrismaService);
    await prisma2.$connect();
    await prisma2.$disconnect();
    await module2.close();
  });
});
