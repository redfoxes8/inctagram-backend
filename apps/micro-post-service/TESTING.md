TESTING: Micro-post-service — Canonical Test Bootstrap

Purpose

- Short, practical rules for writing infra/integration/e2e tests for `micro-post-service`.
- Keep tests deterministic, use the canonical DI wiring, and avoid multiple testing architectures.

Canonical bootstrap (single contract)

- Tests must bootstrap via `createTestApp()` (test factory) which composes:
  - `ConfigModule.forRoot({ isGlobal: false, envFilePath: '.env.test' })`
  - `PostConfigModule` (imports `ConfigModule` and produces validated `PostConfig`)
  - Target modules under test (e.g., `PostsModule` or `AppModule` for integration/e2e)
- Do NOT `new PrismaService(...)` in tests. Obtain `PrismaService` from DI: `const prisma = module.get(PrismaService)`.

Why this contract

- Ensures tests exercise the same provider wiring as runtime.
- Prevents hidden global provider pollution (`ConfigModule` is local-scoped for tests).
- Keeps lifecycle symmetric: `await prisma.$connect(); await prisma.$disconnect(); await module.close();`.

Infra / Integration / E2E boundaries

- Infra tests (fast, focused): bootstrap minimal set that provides infra providers (ConfigModule + PostConfigModule + `PostsModule`). Purpose: verify Prisma connect, migrations, reset, cron wiring, grpc client init.
- Integration tests (feature-level): bootstrap `AppModule` or `AppModule.forRoot()` to test interactions across modules.
- E2E tests (system-level): separate pipeline, may run with containers or real external services.

DB lifecycle and reset rules

- Use `prepareTestDatabase()` to run `prisma migrate deploy` (serialized by FS-lock) and ensure schema is present.
- Use `resetTestDatabase()` to TRUNCATE all tables in `current_schema()` except `_prisma_%` (deterministic). TRUNCATE uses `RESTART IDENTITY CASCADE`.
- Always acquire FS lock implicitly via helpers — do not run migrations/truncate in parallel without lock or per-worker DBs.

Env handling

- Tests load `apps/micro-post-service/.env.test` via `jest.env-setup.ts`. Prefer explicit `envOverrides` to `createTestApp()` for missing envs.
- Do not mutate global process.env in helpers without restoring previous values.

Parallelism policy

- Default: `maxWorkers=1` for integration/infra test jobs.
- If parallel execution is required, either:
  - use per-worker isolated databases, or
  - rely on the existing FS-lock mechanism which serializes migrate/truncate (has timeout fallback).

Lifecycle rules (must follow in tests)

- beforeAll: minimal bootstrap using `createTestApp()`.
- beforeEach: prefer test-local DB state management via `resetTestDatabase()` (truncate) if needed.
- afterEach: avoid leaving open DB connections; if test created resources, clean them.
- afterAll: call `await prisma.$disconnect()` (if obtained directly) and `await module.close()`.

Why direct service instantiation is forbidden

- Bypasses DI and `PostConfig` validation, causing drift between runtime and tests.
- Breaks predictable lifecycle management (module close won't manage manually-instantiated services).

Quick examples

- Get `PrismaService` (recommended):

  const module = await createTestApp({ imports: [PostsModule] }, { /_ envOverrides _/ });
  const prisma = module.get(PrismaService);
  await prisma.$connect();
  // ... run checks
  await prisma.$disconnect();
  await module.close();

Files to reference

- Test factory: [apps/micro-post-service/test/test-app.factory.ts](test/test-app.factory.ts)
- Reset helpers: [apps/micro-post-service/test/reset-db.ts](test/reset-db.ts)
- DB guard: [apps/micro-post-service/test/validate-test-db-environment.ts](test/validate-test-db-environment.ts)
- Smoke test example: [apps/micro-post-service/test/integration/smoke.integration-spec.ts](test/integration/smoke.integration-spec.ts)

Policy: minimal changes only

- Do not add new testing abstractions. Keep patterns small, repeatable, and explicit.

If you want, I can add a short checklist file for CI job templates that enforces `maxWorkers=1` and run sequence.
