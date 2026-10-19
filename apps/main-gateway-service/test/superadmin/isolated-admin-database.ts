import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/core/prisma/client';
import type { PrismaService } from '../../src/core/prisma/prisma.service';

// A new disposable local container only. Never read application DATABASE_URL/env files.
export class IsolatedAdminDatabase {
  readonly container = `sa-admin-test-${randomUUID()}`;
  private connectionString: string;
  private readonly clients: PrismaClient[] = [];
  private running = false;

  async start(
    input: {
      beforeMigration?: (input: { name: string; database: IsolatedAdminDatabase }) => void;
      deployLastWithPrisma?: boolean;
      deployFromMigration?: string;
    } = {},
  ): Promise<void> {
    execFileSync(
      'docker',
      [
        'run',
        '--detach',
        '--rm',
        '--name',
        this.container,
        '--env',
        'POSTGRES_PASSWORD=isolated-test-only',
        '--publish',
        '127.0.0.1::5432',
        'postgres:16-alpine',
      ],
      { stdio: 'pipe' },
    );
    this.running = true;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        execFileSync(
          'docker',
          ['exec', this.container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'],
          {
            stdio: 'pipe',
          },
        );
        break;
      } catch {
        if (attempt === 99) throw new Error('Isolated PostgreSQL did not become ready');
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
      }
    }
    const port = execFileSync('docker', ['port', this.container, '5432/tcp'], { encoding: 'utf8' })
      .trim()
      .split(':')
      .at(-1);
    this.connectionString = `postgresql://postgres:isolated-test-only@127.0.0.1:${port}/postgres`;
    const migrations = join(process.cwd(), 'apps/main-gateway-service/src/core/prisma/migrations');
    const names = readdirSync(migrations)
      .filter((name) => /^\d/.test(name))
      .sort();
    for (const name of names) {
      if (name === '20261018120000_add_admin_sessions') {
        this.sql(
          `INSERT INTO "User" ("id", "email") VALUES ('migration-preserved-user', 'preserved@example.test');`,
        );
      }
      input.beforeMigration?.({ name, database: this });
      if (input.deployFromMigration === name) {
        // The older history was applied/baselined explicitly. Deploy the entire new chain.
        this.prismaMigration(['deploy']);
        break;
      }
      if (input.deployLastWithPrisma && name === names.at(-1)) {
        this.prismaMigration(['deploy']);
      } else {
        this.sql(readFileSync(join(migrations, name, 'migration.sql'), 'utf8'));
        // Baseline the existing fixture schema through the official CLI, then deploy ONLY
        // the new migration through migrate deploy. Never consume application DB URLs.
        if (input.deployLastWithPrisma || input.deployFromMigration)
          this.prismaMigration(['resolve', '--applied', name]);
      }
    }
  }

  private prismaMigration(args: string[]): void {
    execFileSync(
      process.execPath,
      [
        join(process.cwd(), 'node_modules/prisma/build/index.js'),
        'migrate',
        ...args,
        '--config',
        'apps/main-gateway-service/src/core/prisma/prisma.config.ts',
      ],
      {
        env: { ...process.env, NODE_ENV: 'test', PRISMA_DB_URL_DIRECT: this.connectionString },
        stdio: 'pipe',
      },
    );
  }

  client(): PrismaService {
    const client = new PrismaClient({
      adapter: new PrismaPg({ connectionString: this.connectionString }),
    });
    this.clients.push(client);
    return client as PrismaService;
  }

  sql(statement: string): void {
    execFileSync(
      'docker',
      [
        'exec',
        '-i',
        this.container,
        'psql',
        '-U',
        'postgres',
        '--single-transaction',
        '-v',
        'ON_ERROR_STOP=1',
      ],
      { input: statement, stdio: ['pipe', 'pipe', 'pipe'] },
    );
  }

  async stop(): Promise<void> {
    await Promise.all(this.clients.map((client) => client.$disconnect()));
    if (this.running) {
      execFileSync('docker', ['stop', this.container], { stdio: 'pipe' });
      this.running = false;
    }
  }
}
