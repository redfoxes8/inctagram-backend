# HANDOFF — Agent Handoff Package

## Purpose

Compact operational transfer for the next agent (Antigravity). No infra changes — read this, run tests, continue implementing integration tests within the canonical contract.

1. Current architecture status (short)

- Canonical runtime/test bootstrap stabilized: `createTestApp()` (local `ConfigModule`) → `PostConfigModule` → target module(s) (`PostsModule` or `AppModule`).
- Prisma is real and used via `PrismaService` (adapter-pg). Migrations run via `prisma migrate deploy` in `prepareTestDatabase()`.
- DB lifecycle serialized by a simple FS-lock at `tmp/test-migrate.lock` (prepare/migrate/truncate guarded).

2. What was stabilized

- Deterministic test bootstrap (`createTestApp`) that does not mutate global ConfigModule.
- Deterministic DB prepare/reset helpers: `prepareTestDatabase()` and `resetTestDatabase()`.
- Jest integration contract: `maxWorkers:1`, `--detectOpenHandles` enabled in CI config.
- Smoke/integration tests scaffolding and first integration tests implemented and passing locally.

3. Mandatory canonical patterns (must follow)

- Use `createTestApp()` for all integration tests. Do NOT instantiate core services manually.
- Use local `ConfigModule.forRoot({ isGlobal:false, envFilePath: '.env.test' })` only via `createTestApp()`.
- Obtain services/repositories via DI: `module.get(PrismaService)`, `module.get(CreatePostHandler)`, `module.get(PostCommandRepository)`, etc.
- Use `prepareTestDatabase()` once per suite (beforeAll) and `resetTestDatabase()` beforeEach.
- Always call `await module.init()` after `createTestApp()` to trigger `onModuleInit()` (Prisma connect, handlers init) and `await module.close()` in afterAll.

4. Forbidden anti-patterns

- Do NOT instantiate `PrismaService` directly with `new`.
- Do NOT make `ConfigModule` global in tests.
- Do NOT add TestingRootModule, extra bootstrap layers, or a transaction-per-test rewrite now.
- Do NOT add new mocking frameworks or orchestration layers at this time.

5. Tests that exist (current)

- apps/micro-post-service/test/integration/create-post.integration-spec.ts — full happy-path (create → persist → readback).
- apps/micro-post-service/test/integration/delete-post-outbox.integration-spec.ts — delete → post removed & OutboxEvent created.
- apps/micro-post-service/test/integration/grpc-failure.integration-spec.ts — simulate file-service failure; handler throws, DB unchanged.
- apps/micro-post-service/test/integration/migration-reset-smoke.integration-spec.ts — migrations, reset, connect, close.

6. Tests pending / high value next candidates

- create-post additional assertions and edge-cases
- delete-post / outbox relay (end-to-end with Rabbit if desired later)
- concurrency ordering / heavy load tests (defer until infra scales)

7. Exact bootstrap contract (copyable)

- Call: `const module = await createTestApp({ imports: [PostsModule], providers?: [...] }, envOverrides?)`
- Then: `await module.init()` to run `onModuleInit()` hooks (Prisma connects).
- Use `await prepareTestDatabase()` in `beforeAll` and `await resetTestDatabase()` in `beforeEach`.
- Obtain providers via DI: `const handler = module.get(CreatePostHandler); const prisma = module.get(PrismaService);`
- Tear down: `await module.close()` in `afterAll`.

8. DB lifecycle contract (stable rules)

- `prepareTestDatabase()`:
  - requires `DATABASE_URL` in env; runs `prisma migrate deploy` (serialized via FS-lock), then deterministic `TRUNCATE` of all non-_prisma_ tables.
- `resetTestDatabase()`:
  - deterministic `TRUNCATE ... RESTART IDENTITY CASCADE` of non-_prisma_ tables; serialized via same FS-lock.
- Keep a single `DATABASE_URL` for tests. Do not rely on multiple DB targets until you intentionally design per-worker DBs.

9. gRPC stubbing workaround (current, approved)

- Problem: `ClientsModule.registerAsync()` registers `ClientGrpc` which the handler accesses in `onModuleInit()`; this can produce network calls that break offline tests.
- Current test-level workaround (non-invasive):
  1. Provide minimal `envOverrides` to satisfy `PostConfig`.
  2. Call `await module.init()`.
  3. Replace the handler's internal `fileService` with a fake: `// @ts-expect-error; handler.fileService = fake.getService()`.
  4. Run handler methods via DI. This preserves real repos and Prisma, avoids bootstrap refactors.
- Note: This is intentional and documented; it is hacky but acceptable until >10 tests require nicer ergonomics.

10. CI assumptions

- `maxWorkers: 1` for these tests; `--detectOpenHandles` is enforced.
- `prepareTestDatabase()` must be able to run in CI with provided `DATABASE_URL` and permission to execute migrations.
- FS-lock uses filesystem at repository `tmp/test-migrate.lock` (CI must allow file locks in workspace).

11. Known acceptable tradeoffs

- Post-init handler override vs pre-compile provider override: chosen for minimal infra impact.
- Simple FS-lock vs advisory DB locks: FS-lock is easier to reason about, adequate for current scale.

12. Known real blockers (do NOT refactor to fix now)

- Pre-compile override of `ClientsModule` is awkward — replacing `handler.fileService` at runtime is the current workaround.
- If many tests require stubbing, a tiny `overrideProviders` option to `createTestApp()` is acceptable later; do not change now.

13. What NOT to refactor now (strict)

- No TestingRootModule.
- No bootstrap redesign.
- No transaction-per-test rewrite.
- No mocking-framework introduction.
- No orchestration / heavy infra changes.

14. Recommended next implementation order (short)

1) Fill out remaining happy-path feature tests (create-post variants, delete-post edge cases).
2) Implement 5–10 more real integration tests using the established post-init override pattern.
3) If repeated friction appears (≥10 tests), consider the minimal `overrideProviders` helper.

FAST ONBOARDING (first steps)

- Files to read first (in order):
  1. apps/micro-post-service/test/test-app.factory.ts
  2. apps/micro-post-service/test/reset-db.ts
  3. apps/micro-post-service/test/jest.config.ts
  4. apps/micro-post-service/src/core/post.config.ts
  5. apps/micro-post-service/src/core/prisma/prisma.service.ts
  6. apps/micro-post-service/src/modules/posts/posts.module.ts
  7. apps/micro-post-service/test/integration/create-post.integration-spec.ts

- Tests to run first:
  1. create-post.integration-spec.ts
  2. delete-post-outbox.integration-spec.ts
  3. grpc-failure.integration-spec.ts

- Commands to verify health:
  - Run single test:
    ```bash
    npx -y jest apps/micro-post-service/test/integration/create-post.integration-spec.ts -i --runInBand --config apps/micro-post-service/test/jest.config.ts --runTestsByPath
    ```
  - Run the three sanity tests:
    ```bash
    npx -y jest \
      apps/micro-post-service/test/integration/create-post.integration-spec.ts \
      apps/micro-post-service/test/integration/delete-post-outbox.integration-spec.ts \
      apps/micro-post-service/test/integration/grpc-failure.integration-spec.ts \
      -i --runInBand --config apps/micro-post-service/test/jest.config.ts --runTestsByPath
    ```

- Expected outcomes: tests pass locally; Prisma connects; migrations applied; DB truncated between tests; no open handles.

CURRENT PROJECT STATE

- Infra-hardening phase: COMPLETE (canonical bootstrap + DB lifecycle stabilized).
- Integration-testing phase: ONGOING — first 3 real integration tests implemented and passing.
- Confidence level: MEDIUM-HIGH for correctness and determinism for further tests at current scale.
- Remaining risks: ergonomics for external client stubbing; parallelization scaling (FS-lock contention) when many concurrent runs are required.
- Production-ready: runtime service and transactional outbox design NOT changed here; tests exercise DB behaviours; production readiness requires feature-complete tests + infra for CI parallelism.
- Intentionally deferred: provider-level pre-compile overrides and parallel per-worker DB strategy.

NEXT AGENT EXECUTION PLAN (Antigravity)
Phase A (immediate):

- Implement real integration tests only. Follow canonical bootstrap and per-test post-init override pattern for external clients. Do NOT refactor infra.

Phase B (after ~10 tests):

- Review repeated friction patterns. If many tests require the same workaround, implement a minimal `overrideProviders` opt-in helper in `createTestApp()` — small, targeted change only.

Phase C (optional):

- Only after clear repetition, implement ergonomic improvements (pre-compile overrides or lightweight test tokens). Keep changes minimal and isolated to test code.

DO NOT DO (explicit warnings)

- No TestingRootModule.
- No bootstrap redesign.
- No transaction-per-test rewrite.
- No premature mocking framework.
- No new orchestration layer.
- No direct `new PrismaService(...)` instantiation.
- No restoring `ConfigModule` to be global in tests.

Files created/modified during stabilization (inventory)

- apps/micro-post-service/test/test-app.factory.ts
- apps/micro-post-service/test/reset-db.ts
- apps/micro-post-service/test/jest.config.ts
- apps/micro-post-service/test/jest.env-setup.ts
- apps/micro-post-service/test/integration/create-post.integration-spec.ts
- apps/micro-post-service/test/integration/delete-post-outbox.integration-spec.ts
- apps/micro-post-service/test/integration/grpc-failure.integration-spec.ts
- apps/micro-post-service/test/integration/migration-reset-smoke.integration-spec.ts
- apps/micro-post-service/TESTING.md
- Tasks.md (updated checkpoints)

Suggested first task for Antigravity

- Implement the next highest-value integration test (suggest: `create-post` edge cases or `delete-post` edge cases) using the canonical bootstrap. Report ONLY repeated friction patterns (external client stubbing, missing env vars, or lifecycle gotchas).

End of HANDOFF — keep the canonical contract; do not refactor infra unless a repeated blocker appears.
