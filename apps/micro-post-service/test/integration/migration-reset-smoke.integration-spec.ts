import { TestingModule } from '@nestjs/testing';
import { createTestApp } from '../test-app.factory';
import { prepareTestDatabase, resetTestDatabase } from '../reset-db';
import { PostsModule } from '../../src/modules/posts/posts.module';

describe('Migration / Reset Smoke', () => {
  let module: TestingModule;

  it('runs migrations, bootstraps module, resets DB and closes cleanly', async () => {
    await prepareTestDatabase();
    module = await createTestApp(
      { imports: [PostsModule] },
      {
        PORT: '3004',
        GRPC_PORT: '50051',
        RABBITMQ_URL: 'amqp://localhost',
        FILE_SERVICE_GRPC_URL: 'localhost:50051',
      },
    );
    await module.init();

    // sanity check prisma connectivity
    const prisma = module.get(require('../../src/core/prisma/prisma.service').PrismaService);
    const res = await prisma.$queryRaw`SELECT 1 as ok`;
    expect(res).toBeDefined();

    await resetTestDatabase();

    await module.close();
  });
});
