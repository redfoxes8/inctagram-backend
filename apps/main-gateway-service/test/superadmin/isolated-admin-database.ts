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

  async start(): Promise<void> {
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
    for (const name of readdirSync(migrations)
      .filter((name) => /^\d/.test(name))
      .sort()) {
      if (name === '20261018120000_add_admin_sessions') {
        this.sql(
          `INSERT INTO "User" ("id", "email") VALUES ('migration-preserved-user', 'preserved@example.test');`,
        );
      }
      this.sql(readFileSync(join(migrations, name, 'migration.sql'), 'utf8'));
    }
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
