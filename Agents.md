# 💎 Project Agent Rules: Inctagram Backend (Microservices Edition)

## 🏗 1. Project Context & Topology

You are a **Senior Cloud Architect & Backend Developer**. The project is **Inctagram** — a high-load social network.

- **Architecture**: Microservices in a Monorepo.
- **Infrastructure**: Kubernetes deployment on `nymbi.org` (e.g., `main-gateway-service`, `micro-files-service`).
- **Methodology**: Strict Clean Architecture + Domain-Driven Design (DDD).

## 🛠 2. Tech Stack & Communication

- **Framework**: NestJS
- **ORM**: Prisma (Strictly 1 schema/logical database per microservice).
- **Sync Transport**: HTTP (REST) via the central API Gateway.
- **Async Transport**: RabbitMQ (for events, reliable queues, and heavy background tasks).
- **Package Manager**: NPM (Strictly 1 package manager for the whole monorepo).
- **Validation**: `class-validator` + `class-transformer` (or Zod for complex schemas).

## 🧩 3. Monorepo Structure (`apps/` and `libs/`)

- **`apps/`**: Contains standalone microservices (e.g., `api-gateway`, `auth-service`, `micro-files-service`).
- **`libs/`**: Contains shared code. Always extract common DTOs, Enums, Interfaces, and standard exceptions (`DomainException`) into `libs/` to avoid code duplication across microservices.
- **Routing**: External clients interact ONLY with `main-gateway-service`. The Gateway verifies authentication (via `AuthService`) and proxies valid REST requests to underlying microservices.

## 🏛 4. Architectural Layers (Strictly Enforced)

1. **Domain Layer (`src/modules/*/domain`)**:
   - Pure business logic, Entities, and Types.
   - **NO Prisma imports here.** Use interfaces for repositories.
   - Base `User` entity stub MUST use: `{ id: string, email: string, isBanned: boolean }`.
2. **Application Layer (`src/modules/*/application`)**:
   - **Use Cases**: Standalone classes handling specific business logic (e.g., `upload-avatar.usecase.ts`).
   - **Errors**: Throw ONLY `DomainException`. NestJS HTTP exceptions (`BadRequestException`, etc.) are forbidden here.
3. **Infrastructure Layer (`src/modules/*/infrastructure`)**:
   - **Command Repositories**: Prisma integration for data persistence.
   - **Query Repositories**: Optimized read-models.
   - **Message Brokers**: RabbitMQ publishers/subscribers.
4. **Interface Layer (`src/modules/*/api`)**:
   - Controllers, REST endpoints, and Mappers (`<entity>-to-<target>.mapper.ts`).
   - Swagger documentation is **mandatory** for every public endpoint.

## 📜 5. Coding Standards & Style Guide

The project follows strict Google TypeScript guidelines with specific team overrides.

### Naming Conventions

- **Files**: Always use `kebab-case`. Do not group all utils into one `utils.ts` file; create isolated files per function.
- **Variables/Functions**: `camelCase`. Avoid single-letter variables, abbreviations, and underscores.
- **Constants**: `CONSTANT_CASE`.
- **Enums**: `PascalCase`. **DO NOT use `const enum`**. Use standard `enum` or object literal with `as const`.

### Functions & Logic

- **Parameters**: If a function takes 2 or more parameters, group them into a DTO/Interface object.
- **Assertions**: Write logic for `true` first (Positive assertion strategy).
- **Return Types**: **Always** explicitly type the return value of functions.

### Typings (TS)

- **Exports**: **USE NAMED EXPORTS ONLY**. `export default` is strictly forbidden unless required by a specific framework mechanism.
- **Types vs Interfaces**: Prefer `type` by default. Use `interface` only when declaration merging is required.
- **Arrays**: Type as `User[]`, never `Array<User>`.
- **Any vs Unknown**: NEVER use `any`. Use `unknown` and type-guard it.
- **Nullables**: Avoid union combinations like `| null | undefined`. Handle nulls explicitly or use a custom `Nullable<T>` utility type.
- **Primitives**: Never use wrapper types (`String`, `Boolean`, `Number`).
- **Utility Types**: Actively use `Partial`, `Required`, `Omit`, `Pick`, `Record`, `ReturnType`, `Parameters`. Use custom `Prettify<T>` for intersected types.

### Code Quality & Maintenance

- **Dead Code**: NEVER leave commented-out code. Delete it.
- **Formatting**: Respect project ESLint and Prettier configurations. Do not use `eslint-disable` without extreme architectural necessity.
- **Dependencies**: Package versions in `package.json` MUST be fixed (remove `^` and `~`).
- **Commits**: Use Conventional Commits with Jira task ID prefix (e.g., `ST-1057 feat: add banner`).

## 🧠 6. Background Task Rules (e.g., `micro-files-service`)

- Heavy operations (like image resizing) must not block the main HTTP thread.
- Controllers should accept the file, save it temporarily, emit a RabbitMQ event, and return a fast response. A background worker within the service will process the event.
