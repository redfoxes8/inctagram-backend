# GraphQL Superadmin — переработанный Jira-план

## 1. Статус и история

**REVISED DRAFT — решения пользователя внесены, внешние вопросы и незавершённые контракты явно отмечены.**

Исследование: 12.10.2026 (Europe/Kiev). Ветка: `docs/payment-subscription-lifecycle`; commit: `11b778cece56321e990bbe8f9f3bacdc1a57457c`.

Скриншоты недоступны в рабочем контексте; использована только текстовая выжимка ТЗ из задачи. После review решения по auth/block/delete сохранены, Payments использует существующий RPC, а социальные вкладки не заменяются заглушкой. Согласованная структура содержит ровно девять замороженных карточек, включая исследование social graph; 4A/4B — подзадачи карточки 4, не отдельные карточки. Номер карточки не задаёт строгий порядок выполнения.

Метки: **[ТЗ]** — исходное требование; **[Код]** — доказано текущим кодом; **[Решение]** — одобрено пользователем для планирования; **[Предложение]** — техническое решение, ожидающее review; **[Внешний вопрос]** — информации нет, не предполагать.

## 2. Выжимка ТЗ и границы

- **[ТЗ]** Новое frontend-приложение: Next.js + Apollo GraphQL. UC-1: вход с `admin@gmail.com` / `admin`, затем Users list.
- **[ТЗ]** UC-2: список всех пользователей: User ID, username, Profile link, Date added, delete/block/unblock; по 8 последних созданных записей с пагинацией.
- **[ТЗ]** UC-3: delete исполняется только после UI `Yes`; `No`/крестик mutation не вызывают. Ручной delete — только вновь созданный через Swagger disposable user, не существующие аккаунты.
- **[ТЗ]** UC-4: поиск по username. UC-5: username A–Z/Z–A и дата новые/старые; примечание о frontend-фильтрации не отменяет backend.
- **[ТЗ]** UC-6: фото, username, ID, profile link, дата создания; paginated Payments, Followers, Following.
- **Backend scope:** GraphQL/API, state/authz, contracts, use cases, service integrations, tests и документация. **Frontend scope:** Next.js/Apollo, UI confirmation, отображение и маршрутизация. Пароль не может быть во frontend bundle.
- **Не в scope:** federation, новый broker, переписывание REST, новый Follow MS без доказанной архитектурной необходимости, изменения Stripe/subscription lifecycle.

## 3. Карта текущей реализации и доказательства

Карта ниже — исторический срез первоначального исследования. Фактическое дополнение SA-GQL-04A описано в карточке 4 ниже; наличие модели состояния не означает реализацию enforcement.

| Область | Факт | Доказательство |
|---|---|---|
| Вход/транспорт | Публичный HTTP — gateway с prefix `api/v1`, cookie+CORS; user gRPC server в gateway; gRPC clients для Payment/File/Post; RabbitMQ — events. | `apps/main-gateway-service/src/main.ts` — `bootstrap`; `libs/common/src/setup/global-prefix.setup.ts` — `GLOBAL_PREFIX`; `apps/main-gateway-service/src/modules/payments/infrastructure/payment-grpc-client.module.ts` — `PaymentGrpcClientModule` |
| Версии | NestJS `11.0.1`, Express; нет `graphql`, `@nestjs/graphql`, Apollo server/client. | `package.json` — dependencies |
| Composition/validation | `AppModule` собирает Auth/Users/Sessions/Payments; CQRS в Users; global ValidationPipe (`transform`, `whitelist`) и `GlobalDomainExceptionFilter`. | `apps/main-gateway-service/src/app.module.ts` — `AppModule`; `apps/main-gateway-service/src/modules/users/users.module.ts` — `UsersModule`; `libs/common/src/setup/app-setup.ts` — `appSetup`; `libs/common/src/setup/validation-pipe-options.ts` — `BASE_VALIDATION_PIPE_OPTIONS` |
| User/Profile | Gateway DB: `User` содержит `isConfirmed`, `createdAt`, nullable `deletedAt`; `Profile` — optional relation, username и avatarUrl. Нет `isBanned`. | `apps/main-gateway-service/src/core/prisma/schema.prisma` — `User`, `Profile`; `apps/main-gateway-service/src/modules/users/domain/user.entity.ts` — `UserEntity` |
| Lifecycle reads | Standard user repositories скрывают `deletedAt != null`; Profile может отсутствовать. | `apps/main-gateway-service/src/modules/users/infrastructure/users.repository.ts` — `findById`, `findByEmail`, `update`; `users.query-repository.ts` — `getUserById`; schema `User.profile` |
| User APIs | Есть lookup ID/email, profile-by-ID и exact username, count; нет admin list/partial search/sort/delete/block. | `apps/main-gateway-service/src/modules/users/infrastructure/users.query-repository.ts` — `PrismaUsersQueryRepository`; `profile.query-repository.ts` — `ProfileQueryRepository`; `users.repository.ts` |
| Обычная auth | Local login требует existing confirmed User/password hash; access JWT bearer, refresh в cookie, sessions в БД. JWT payload: user/device/type. | `apps/main-gateway-service/src/common/strategies/local.strategy.ts` — `LocalStrategy.validate`; `apps/main-gateway-service/src/modules/auth/api/auth.controller.ts` — `login`, `refreshToken`, `logout`; `.../auth/application/interfaces/jwt.service.interface.ts` — `TokenPayload`; `.../login.use-case.ts` — `LoginUseCase` |
| Критичный access gap | `JwtStrategy` проверяет подпись/type, не User state и не session. `deleteAllByUserId` удаляет DB rows, но не валидирует уже выданный access JWT. Notification WS также вызывает лишь `verifyAccessToken`. | `apps/main-gateway-service/src/common/strategies/jwt.strategy.ts` — `JwtStrategy.validate`; `apps/main-gateway-service/src/modules/sessions/infrastructure/sessions.repository.ts` — `deleteAllByUserId`; `apps/main-gateway-service/src/modules/notifications/api/ws/notifications.gateway.ts` — `afterInit` |
| Каналы | REST Users/Profile/Posts/Payments/Sessions/Notifications используют `JwtGuard`; user gRPC — внутренний, его reads скрывают deleted; notification WS — отдельная JWT-проверка. | `apps/main-gateway-service/src/common/guards/jwt-auth.guard.ts` — `JwtGuard`; controllers с `@UseGuards(JwtGuard)`; `.../users/api/grpc/user.grpc.controller.ts` — `UserGrpcController`; WS file выше |
| Soft delete | Базовая entity умеет `markAsDeleted`, но нет user delete command; есть `deletedAt`, не hard delete. | `libs/common/src/domain/base.domain.entity.ts` — `markAsDeleted`; `UserEntity`; `PrismaUsersRepository.update` |
| Payments | `GetPaymentHistory(user_id,page,page_size)` уже принимает target `userId`, возвращает 15 полей/history metadata; query сортирует `createdAt DESC, id DESC`. REST подставляет только current JWT user ID; public REST route не годится для admin. REST page limit 1..50. gRPC не имеет caller role. | `libs/contracts/src/proto/payment.proto` — `GetPaymentHistory*`, `PaymentHistoryItem`; `apps/micro-payment-service/src/modules/payment/application/queries/get-payment-history.query.ts` — `GetPaymentHistoryHandler`; `.../infrastructure/repositories/payment-query.repository.ts` — `getPaymentHistory`; gateway `payment.controller.ts`; `get-payment-history.query-params.ts` |
| Payment failure | Gateway maps RPC errors to `DomainException`; history call без локального timeout в отличие от webhook. | `apps/main-gateway-service/src/modules/payments/infrastructure/payment-grpc.client.ts` — `getPaymentHistory`; `libs/common/src/grpc/grpc-error.mapper.ts` |
| Followers/Following | Нет follow relation/service. Public DTO прямо говорит Follow MS не реализован и mapper возвращает zero counts. Это не Payment subscriptions. | `apps/main-gateway-service/src/modules/users/api/rest/dto/get-profile.dto.ts`; `.../mappers/profile.http.mapper.ts` — `toGetProfileResponseDto` |
| Profile link/tests | Есть общий `FRONTEND_URL`, public-profile route не найден. Есть Jest unit/integration/e2e; GraphQL setup отсутствует. | `apps/main-gateway-service/src/core/gateway.config.ts` — `frontEndUrl`; `apps/main-gateway-service/test/jest.config.ts`; `test/auth/auth.e2e-spec.ts` |

## 4. Решения, lifecycle и границы

**[Решение]** Delete — soft delete, сохраняет payment history, отзывает user sessions и прекращает защищённый доступ; restore вне блока. Block немедленно прекращает защищённый доступ даже по старому access JWT, отзывает sessions; unblock не восстанавливает sessions и требует новый login. Причина block пока не нужна.

**[Предложение]** Добавить в User независимый `isBanned: boolean` (термин AGENTS.md) default false; `isConfirmed` остаётся отдельным. ACTIVE означает только «не blocked и не deleted»: он не отменяет существующие `isConfirmed`, password/OAuth, token-expiry, session и прочие проверки доступа.

| Текущее | Команда | Результат / конкуренция |
|---|---|---|
| ACTIVE | block | BLOCKED, sessions removed; concurrent block: `BLOCKED`/`ALREADY_BLOCKED` |
| BLOCKED | unblock | ACTIVE, sessions не создаются; concurrent unblock: `UNBLOCKED`/`ALREADY_ACTIVE` |
| ACTIVE/BLOCKED | delete | DELETED, `deletedAt`, sessions removed; delete приоритетнее block/unblock |
| DELETED | unblock/block | `USER_DELETED`; не восстанавливает user |
| DELETED | delete | `ALREADY_DELETED` |

**[Предложение]** В одной gateway DB transaction command conditionally обновляет User state и удаляет Sessions. Admin command repository читает state включая deleted (`findUnique`/admin repository), в отличие от обычных reads: поэтому `ALREADY_DELETED` отличим от `NOT_FOUND`. `NOT_FOUND` — ID отсутствует; `ALREADY_DELETED` — ID существует с `deletedAt`; distinction доступен лишь superadmin. Conditional `updateMany`/row lock + transaction задают race semantics; после `deletedAt` block/unblock возвращают `USER_DELETED`.

**[Внешний вопрос]** policy для posts, files, comments, public profile, notifications и active paid auto-renew после delete не определена. Soft delete **не означает** cancellation subscription. Product + Post/File/Payment owners должны утвердить политику; Stripe lifecycle не меняется этим блоком.

### Минимальный audit state changes

**[Предложение]** SA-GQL-04 этап A добавляет в gateway DB `AdminUserActionAudit`; owner — Users+Sessions/security. Каждая попытка `block`, `unblock`, `delete` записывает в той же transaction (когда target существует) либо отдельной короткой transaction для `NOT_FOUND`: `action`, `targetUserId`, `outcome`, `occurredAt`, `adminSessionId`. Не хранить opaque token, cookie, password или credential hash. SA-GQL-05 использует тот же writer для delete. AC: for each completed mutation exists exactly one audit row with requested target/outcome/timestamp/session identifier; tests assert absence of token/password fields. Общий fixed admin account не даёт и не обещает идентификацию конкретного человека.

### Матрица доступа

`Да*` — target policy после реализации; current code этого ещё не гарантирует. Public read — не подтверждён.

| State | Login | Refresh | старый access | REST/GraphQL protected | Notification WS | Sessions | команды | Public read |
|---|---|---|---|---|---|---|---|---|
| ACTIVE | Да* | Да* | Да* | Да* | Да* | active | block/delete | [Вопрос] |
| BLOCKED | Нет* | Нет* | Нет* | Нет* | disconnect/reject* | revoked | unblock/delete | [Вопрос] |
| DELETED | Нет* | Нет* | Нет* | Нет* | disconnect/reject* | revoked | delete=`ALREADY_DELETED`; block/unblock=`USER_DELETED` | [Вопрос] |

**Необходимые изменения:** общий `UserAccessState` query/port после JWT signature в REST `JwtStrategy`/guard; тот же check в GraphQL user context/guard; WS middleware проверяет state + active session before join. Refresh уже lookup-ит session, но должен проверить state. Internal gRPC не public channel; network isolation и allowed deleted calls нужно отдельно определить.

### WebSocket enforcement и topology

**[Код]** `deployment.yaml` не содержит `replicas`, поэтому число gateway pod в production не подтверждено. Socket.IO использует локальный default adapter (`NotificationSocketIoAdapter` не подключает Redis/socket adapter). При этом каждый gateway на startup создаёт собственную `exclusive`, `autoDelete`, `durable: false` RabbitMQ subscriber queue для live notification routing keys, а `NotificationRealtimePublisher` отправляет в локальную Socket.IO room. Это fan-out path для каждого живого pod, но не распределённый socket registry: `apps/main-gateway-service/deployment.yaml`; `src/core/notification-socket-io.adapter.ts` — `NotificationSocketIoAdapter`; `src/modules/notifications/infrastructure/notification-live-event.consumer.ts` — `register`; `.../realtime/notification-realtime.publisher.ts` — `emit`.

**[Предложение] конкретного механизма:** transaction block/delete сначала commit-ит state/session revoke/audit, затем publish-ит `UserAccessRevoked` в тот же confirmed RabbitMQ exchange. Каждый живой gateway consumer получает fan-out event, находит sockets локальной user room и вызывает `disconnect(true)` для каждого. Перед каждым notification realtime emit consumer обязан запросить `UserAccessState`; BLOCKED/DELETED не получает новую защищённую delivery. До реализации prerequisite: подтвердить в staging с двумя gateway pod, что exchange/routing key доставляет revoke обоим exclusive subscribers, и описать retry/monitoring publish failure. Не вводить Redis или новый broker без этого доказательства.

«Немедленно после commit» означает: после успешного transaction commit новые REST/GraphQL/refresh/WS handshake и subsequent realtime deliveries отклоняются state check; existing socket disconnect инициируется fan-out событием. Уже начатый HTTP/GraphQL request или notification emit может завершиться, его безопасно не прерывать посередине; он не даёт права на следующий protected action. Если publish revoke временно не подтверждён, authorization checks всё равно deny, а delivery-check предотвращает последующие event; health/retry — обязательный AC SA-GQL-04/05.

## 5. GraphQL architecture и согласованный planned contract

**[Предложение] schema-first.** В проекте нет GraphQL convention; внешний Next.js/Apollo и несколько backend owners нуждаются в заранее reviewable SDL. Один schema owner; feature owner добавляет SDL fragment только его PR. Совместимые Nest 11 GraphQL/Apollo packages выбрать в dependency review; package/lockfile сейчас не меняются.

**[Предложение]** Gateway endpoint `/api/v1/graphql`. `superadminLogin` допускается без admin session. `superadminLogout` также допускает отсутствие действующей, истёкшую или отозванную session для безопасной идемпотентной очистки cookie и возвращает `{ loggedOut: true }`; при действующей session он отзывает только её. Это исключение не даёт доступа к административным данным или другим mutations. SA-GQL-01 определяет interface `AdminPrincipalVerifier`, GraphQL context и fail-closed default `SuperadminGuard`; пока SA-GQL-02 не зарегистрирует verifier, protected operations закрыты (`UNAUTHENTICATED`). Применимые Origin/CSRF-проверки сохраняются, но отсутствие действующей session само по себе не препятствует безопасной очистке. Ordinary user JWT не есть admin session. Fixed credentials проверяются только server config/secrets. Назначение учебного fixed login и exact config key — **внешний вопрос**.

**[Предложение] минимальной admin session:** opaque random token (не JWT) в cookie `superadminSession`; в gateway PostgreSQL хранится только SHA-256 hash, `id`/session identifier, `createdAt`, `lastSeenAt`, `idleExpiresAt`, `absoluteExpiresAt`, `revokedAt`. Новый `AdminSession` model и migration принадлежат SA-GQL-02 / Auth+Sessions в `apps/main-gateway-service/src/core/prisma/schema.prisma` и migration directory. Это совместимо с Prisma/session pattern проекта и не требует изменения обычного JWT; lookup по digest даёт constant-shape server verification, а утечка БД не даёт browser token.

При успешном fixed-credential login создаются новая random session (proposal: 256-bit token), cookie и record. **[Решение]** Повторный успешный login в том же браузере заменяет текущую admin session и отзывает прежнюю; прежняя cookie больше не предоставляет доступ. Сессии разных браузеров независимы: login или logout одного браузера не отзывает сессии других. Проверка требует неотозванную запись и соблюдение обоих сроков: **idle expiry — 30 минут бездействия**, **absolute expiry — 8 часов от создания**. Активность обновляется не чаще раза в минуту и не продлевает абсолютный срок; истёкшая или отозванная сессия не восстанавливается. `superadminLogout` очищает cookie и идемпотентно возвращает `{ loggedOut: true }` без действующей, с истёкшей или отозванной session, не раскрывая состояние; действующая session отзывается только текущая.

Cookie `superadminSession`: `HttpOnly`, `Secure` в production, `Path=/api/v1/graphql`, отдельное имя от обычного `refreshToken`. `SameSite=Lax` при размещении frontend/backend в пределах одного **site**; если необходима cross-site cookie — `SameSite=None; Secure` с проверкой в браузере. Вариант определяется фактическим размещением и документируется при реализации; разные origins сами по себе не означают разные sites.

**[Предложение]** POST only; CORS exact admin origin + credentials. Для first login, когда CSRF cookie ещё нет, strict Origin/Host allow-list plus JSON-only request are mandatory; после session creation server sets separate readable CSRF nonce cookie and requires matching custom header (double-submit) for cookie-authenticated mutations, including logout. Origin/CSRF-проверки logout применяются независимо от действительности admin session: её отсутствие, expiry или revoke не являются самостоятельной причиной отказа в очистке cookie. Login rate limit proposal `5 attempts/IP+account/15 min`; generic failure. Request body ≤256 KiB, depth ≤8, complexity ≤200, production introspection allow-list review. Это дополняет pageSize, не заменяет его.

Scalars: `DateTime` (ISO-8601 UTC), ID/Int/String/Boolean. `PageInput`: `page=1` range 1..10_000, `pageSize=8` range 1..50 — предложения. `PageInfo { page, pageSize, pagesCount, hasNextPage }`; out-of-range valid page => empty `items` with metadata; bad bounds => `BAD_USER_INPUT`.

```graphql
scalar DateTime
enum SuperadminUserSort { USERNAME_ASC USERNAME_DESC CREATED_AT_DESC CREATED_AT_ASC }
enum SuperadminUserState { ACTIVE BLOCKED }
enum SuperadminDeleteOutcome { DELETED ALREADY_DELETED NOT_FOUND }
enum SuperadminBlockOutcome { BLOCKED ALREADY_BLOCKED NOT_FOUND USER_DELETED }
enum SuperadminUnblockOutcome { UNBLOCKED ALREADY_ACTIVE NOT_FOUND USER_DELETED }
input SuperadminLoginInput { email: String!, password: String! }
input SuperadminUsersInput { page: Int! = 1, pageSize: Int! = 8, searchUsername: String, sort: SuperadminUserSort! = CREATED_AT_DESC }
input SuperadminUserIdInput { userId: ID! }
input PageInput { page: Int! = 1, pageSize: Int! = 8 }
type SuperadminLoginPayload { authenticated: Boolean! }
type SuperadminLogoutPayload { loggedOut: Boolean! }
type SuperadminUserListItem { userId: ID!, username: String, profileUrl: String, createdAt: DateTime!, state: SuperadminUserState!, isEmailConfirmed: Boolean! }
type SuperadminUsersPage { items: [SuperadminUserListItem!]!, totalCount: Int!, pageInfo: PageInfo! }
type SuperadminUser { userId: ID!, username: String, avatarUrl: String, profileUrl: String, createdAt: DateTime!, state: SuperadminUserState!, isEmailConfirmed: Boolean!, payments(input: PageInput!): PaymentConnection }
type SuperadminDeleteUserPayload { userId: ID!, outcome: SuperadminDeleteOutcome! }
type SuperadminBlockUserPayload { userId: ID!, outcome: SuperadminBlockOutcome! }
type SuperadminUnblockUserPayload { userId: ID!, outcome: SuperadminUnblockOutcome! }
type PageInfo { page: Int!, pageSize: Int!, pagesCount: Int!, hasNextPage: Boolean! }
enum PaymentProvider { STRIPE PAYPAL }
enum PaymentBillingInterval { WEEK MONTH }
enum PaymentKind { PURCHASE RENEWAL }
enum PaymentStatus { PENDING PROCESSING SUCCEEDED FAILED REFUNDED PARTIALLY_REFUNDED }
enum CheckoutPurpose { INITIAL_SUBSCRIPTION ADDITIONAL_SUBSCRIPTION }
type PaymentHistoryItem { transactionId: ID!, createdAt: DateTime!, paidAt: DateTime, amountMinor: Int!, currency: String!, productId: ID!, productName: String!, billingInterval: PaymentBillingInterval!, billingIntervalCount: Int!, provider: PaymentProvider!, kind: PaymentKind!, status: PaymentStatus!, checkoutPurpose: CheckoutPurpose, subscriptionId: ID, subscriptionEndsAt: DateTime }
type PaymentConnection { items: [PaymentHistoryItem!]!, totalCount: Int!, pageInfo: PageInfo! }
type Query { superadminUsers(input: SuperadminUsersInput!): SuperadminUsersPage!, superadminUser(userId: ID!): SuperadminUser }
type Mutation { superadminLogin(input: SuperadminLoginInput!): SuperadminLoginPayload!, superadminLogout: SuperadminLogoutPayload!, superadminDeleteUser(input: SuperadminUserIdInput!): SuperadminDeleteUserPayload!, superadminBlockUser(input: SuperadminUserIdInput!): SuperadminBlockUserPayload!, superadminUnblockUser(input: SuperadminUserIdInput!): SuperadminUnblockUserPayload! }
```

`username`, `avatarUrl`, `profileUrl` nullable: `User.profile` optional. Profileless user listed/detailed with nulls; username search does not match it. **[Решение]** catalogue shows every non-deleted user, including blocked/unconfirmed; state and confirmation separate. **[Предложение]** trim + case-insensitive substring search before count/page; empty => no filter; selected sort + ID same-direction tie-breaker. Compatible with model/TЗ, but not original wording.

`profileUrl` planned as public-main-app link, null until route agrees. For `USERNAME_ASC` and `USERNAME_DESC`, null username always sorts last; ID is deterministic secondary key (same direction). Followers/Following are intentionally **absent from frozen FE-start SDL**: source/columns unknown, no fake empty connection. Errors: `UNAUTHENTICATED`, `FORBIDDEN`, `BAD_USER_INPUT`, `NOT_FOUND`, `CONFLICT`, `UPSTREAM_UNAVAILABLE`, `INTERNAL_SERVER_ERROR`; no stacks/secrets. Business payload outcomes above are not generic errors. Detail missing/non-deleted-hidden => null; mutations always return `userId` + operation-specific enum.

The full SDL above is the **target contract in this plan**, not an assertion that all fields run today. Runtime schema publishes an operation/field only in the implementing card PR and its resolver/tests; it must not expose stub operations. SA-GQL-01 owns root/common SDL and records target contract version in the planned frontend document. SA-GQL-03/06 submit versioned fragments after implementation; SA-GQL-08 may submit none until discovery completes and its source is ready.

## 6. Payments и незавершённый social contract

**[Решение] Reuse `GetPaymentHistory`.** No concrete difference requires RPC: it accepts target user ID, pagination and existing table fields. Gateway calls only after SuperadminGuard; public REST binds to current user, so cannot be used. New RPC only if review finds admin-only column, Payment-side caller authorization, or incompatible paging — fixed criteria, not executor choice.

`PaymentConnection` planned: non-null items/metadata; `PaymentHistoryItem` mirrors existing proto. `paidAt`, `checkoutPurpose`, `subscriptionId`, `subscriptionEndsAt` nullable. `payments` field nullable: Payment MS unavailable/timeout => null plus `UPSTREAM_UNAVAILABLE`, base user data stays; never false empty. Existing history bounds 1..50; GraphQL ≤50. Active auto-renew after delete remains external policy; no payment mutation/cancellation.

Социальный контракт остаётся незавершённым: карточка №7 `SA-FOLLOW-DISCOVERY` уточняет источник и контракт карточки №8 в рамках её согласованного scope. Отсутствие пригодного источника — результат исследования, а не реализация вкладок.

## 7. Ownership and parallel work

| Shared area | Single integrator | Rule |
|---|---|---|
| GraphQL module, target SDL root/fragments, context, `AdminPrincipalVerifier`, default guard, errors, scalars, pagination | SA-GQL-01 / gateway platform | 01 publishes only infrastructure; runtime fragment lands only with feature implementation and 01-owner review |
| Admin session/config/schema/migration | SA-GQL-02 / Auth+Sessions | owns `AdminSession`, opaque-token hash, cookie and verifier implementation; no normal JWT cookie conflict |
| User list/detail type/resolvers | SA-GQL-03 / Users | starts after SA-GQL-04A model merge; schema extension through 01 owner |
| User state/audit schema/migrations and revoke transaction | SA-GQL-04A / Users+Sessions/security; SA-GQL-05 final delete integrator | 04A owns `isBanned` and `AdminUserActionAudit`; 05 owns admin deleted reads; migrations serialized |
| Payment resolver/adapter | SA-GQL-06 / Payments | Payment owner owns any proto/generated changes |
| Follow source/contract research | SA-FOLLOW-DISCOVERY / Architecture + Product | reviewed ADR; no working-code changes or source implementation |
| Follow type/resolver | SA-GQL-08 owner from discovery | no placeholder; implementation waits for accepted discovery and ready source |
| `GRAPHQL_SUPERADMIN_FRONTEND_API.md` | SA-GQL-01 / gateway platform is document integrator; SA-GQL-09 final verifier | 01 creates planned contract after review; feature owners submit status/section changes through 01 owner; 09 verifies actual examples |

Основной согласованный маршрут одного исполнителя: **1 → 2 → 4A → 3 → 4B → 5 → 6 → 7 → 8 → 9**. После 2 исполнитель начинает карточку 4 и завершает/merge 4A; карточка 4 остаётся незавершённой. Затем выполняет 3, возвращается к 4B и завершает карточку 4; далее 5–9 по порядку. Это согласованный переход по технической зависимости, не ошибка и не нерешённый блокер.

Справочно: после merge 4A разработка 3 и 4B технически может идти параллельно; это не заменяет основной маршрут. Prisma migrations 02/04A сериализуются; никто кроме owner 01 не интегрирует root SDL/context/guard. Карточку можно **назначить**, когда известны роль и scope; **начать**, когда выполнены условия начала; **принять**, когда выполнены AC/DoD и зависимости приняты и merged.

## 8. Jira cards

### 1. SA-GQL-01 — GraphQL инфраструктура и общий контракт

**Результат:** `/api/v1/graphql`, schema-first target contract, context, `AdminPrincipalVerifier` interface and fail-closed default protection; login и безопасная идемпотентная очистка через logout допускаются без действующей admin session, но их реализация относится к 02.

**SOW:** Nest 11 compatible dependency review; `SuperadminModule`; target SDL storage/loading; HTTP context; verifier interface/default guard; validation/error mapping; complexity/depth/body limits; CORS/CSRF primitives; contract review; then create root `GRAPHQL_SUPERADMIN_FRONTEND_API.md` with clearly **planned** operations/status. **Out:** credential/session storage or working login/logout, user data/mutations, Payment/Follow source, FE. **Owner/files:** gateway platform; new `apps/main-gateway-service/src/modules/superadmin/{api,application,domain,infrastructure}/**`, minimal `app.module.ts`/`main.ts`, later the planned FE MD. **In/out:** section 5 target SDL/error codes/version. **Start:** dependency review; no route/social dependency. **AC:** before 02 every protected root/nested field is denied; ordinary user token denied; infrastructure has no permissive fallback; login and sessionless logout are scoped exceptions, not access to admin data/other mutations; applicable Origin/CSRF checks remain; input/limits safe; target SDL version reviewed; planned FE document created only after review and labels every operation planned. **DoD:** context/guard/error/complexity tests (not auth-flow tests), GraphQL smoke proving fail-closed, CORS/CSRF primitive tests, document ownership recorded. **Risks/errors:** peer mismatch, CORS/introspection/secret leakage.

### 2. SA-GQL-02 — Авторизация и сессии суперadminки

**Согласованное дополнение к контракту карточки 2 (SDL 1.1.0):** пользователь утвердил `Query.superadminSession: SuperadminSessionPayload!`, где `authenticated: Boolean!`. Это защищённое чтение текущей admin session: действующая session возвращает `{ authenticated: true }`, без действующей session — `UNAUTHENTICATED`; token/cookie/hash/credentials не возвращаются. Query не является публичным исключением. Её рабочий resolver и session verifier реализуются только в SA-GQL-02 вместе с login/logout, после чего endpoint включается без ожидания каталога карточки 3. Сейчас дополнение внесено только в целевой SDL и документацию; остальные карточки, их нумерация и зависимости сохранены.

**Результат:** server validates configured fixed credentials and creates/revokes separate admin session; logout invalidates old admin session.

**SOW:** config validation without value; `AdminSession` Prisma model/migration/repository; random opaque token/digest, expiry/revoke and verifier implementation; distinct cookie/CSRF first-login policy; login/logout use cases/resolvers; rate limit. **Out:** ordinary student login/cookies, FE credentials, user state/audit. **Owner/files:** Auth+Sessions; `modules/superadmin/**`, `core/gateway.config.ts`, `src/core/prisma/schema.prisma` + migration, bindings. **Contract:** login/logout payloads and verifier implementation; `superadminSession` cookie is HttpOnly, Secure in production, Path `/api/v1/graphql`, SameSite=Lax for same-site deployment or None; Secure for cross-site, browser-tested and documented. **Start:** SA-GQL-01 interface/context merged. **AC:** correct login creates hashed server record and distinct cookie; wrong credentials generic; successful repeated login in the same browser replaces and revokes its old session and old cookie is denied; other browser sessions survive both login and logout; logout without valid, with expired or revoked session clears cookie and returns `{ loggedOut: true }`, while valid logout revokes only current session; applicable Origin/CSRF checks remain and absence of session alone does not block cleanup; expired/revoked session never restored; ordinary token denied. Idle expiry is 30 minutes, absolute expiry 8 hours from creation; activity updates at most once per minute and never extends absolute expiry. **DoD:** isolated auth-flow e2e (login replacement, browser independence, both expiry boundaries and activity cadence, revoked-session non-restoration, cookie collision, CSRF login/mutation, sessionless/expired/revoked logout), config and chosen SameSite docs without values; update FE document section/status through 01 owner. **Errors/risks:** `UNAUTHENTICATED` for protected access, CSRF/shared-account attribution; fixed-login purpose/rotation external.

### 3. SA-GQL-03 — Каталог и основные детали пользователей

**Фактический результат SA-GQL-03, подготовлен к техническому review:** защищённые `superadminUsers`/`superadminUser`, отдельный implemented SDL fragment, query services и joined query repository. Все неудалённые пользователи (включая blocked/unconfirmed/profileless), фактическое состояние 4A, literal case-insensitive substring search, DB sorting/null-last/ID tie-breaker, общая pagination validation. Count/items читаются одним SQL statement/snapshot; изменения пользовательского доступа не вносятся. Runtime по-прежнему не публикует Payments, mutations 4B/5 или social fields. **Открытый AC Profile link:** подтверждённый публичный frontend route отсутствует в доступных контрактах; `profileUrl: null`, ответственный Frontend/Product. Полное завершение/приёмка карточки не заявляется; остальная реализация готовится к review. Нумерация, зависимости и маршрут не меняются; следующий этап — 4B.

**Результат:** protected list/detail implements UC-2/4/5 and base UC-6 without promising profile exists.

**SOW:** admin join/count repository, use cases/thin resolvers, proposed filter/sort/page, nullable mapper; consume actual `isBanned` from 04A; profile URL only after route decision. **Out:** block/delete commands, Payment/Follow, frontend routing. **Owner/files:** Users; `modules/users/{domain,application,infrastructure}/**`, `modules/superadmin/api/**`. **Contract:** list/detail types. **Start/develop:** SA-GQL-01 and merged SA-GQL-04A; route does not block nullable URL. **Merge/accept:** runtime SDL/resolver needs merged SA-GQL-02 verifier, so no exposed closed-only catalogue operation. **AC:** default 1/8, all non-deleted including actual blocked/unconfirmed, filter before count/page, four stable sorts, null username last for both alpha directions and ID secondary key, profileless visible, beyond page empty, deleted hidden/detail null. **DoD:** repository + GraphQL pagination/search/tie-ID/null-profile tests; runtime SDL fragment/FE document status submitted through 01 owner. **Errors/risks:** bad UUID/bounds; DB collation must meet approved insensitive search; no fictitious ACTIVE synthesis.

### 4. SA-GQL-04 — Блокировка, разблокировка и прекращение доступа

**Фактический результат 4B — подготовлен к техническому review, не production-приёмка:** runtime публикует только согласованные block/unblock поверх auth/catalog. `ModerateUserUseCase` + existing `ITransactionManager`/audit writer: User row lock → state transition → soft-revoke всех пользовательских Session → persistent revoke obligation → один audit result, включая no-op/NOT_FOUND/USER_DELETED; rollback атомарен. Unblock не восстанавливает sessions. Login (password/Google) и refresh сериализуются с block на том же User lock при session write. `UserAccessCheck` проверяет фактический state, ownership/userId/deviceId, deletedAt и expiry конкретной сессии; access.exp не приравнивается к refresh Session.exp. REST JwtStrategy/JwtGuard и notification WS handshake/per-socket delivery используют общий check. Пользовательского GraphQL нет; internal user gRPC и публичное чтение не изменены. ACTIVE не отменяет email confirmation и прочие проверки.

**Надёжный revoke 4B:** новая Gateway migration `20261018140000_add_user_access_revoke_outbox`; dedicated `UserAccessRevokeOutbox` (owner Users+Sessions/security / 4B), потому что avatar relay не поддерживает нужные claims/confirms и выбирает все PENDING как avatar. Relay использует существующий scheduler/AmqpConnection, атомарный SKIP LOCKED claim/30-second lease, publish вне транзакции с 5-second broker confirm timeout, persisted retry/diagnostic code. `UserAccessRevoked` v1 через `common_exchange` topic / `gateway.user.access.revoked.v1`; server-named exclusive очередь каждого Gateway. Event содержит идентификаторы отозванных Session, не секреты; local Socket.IO namespace registry отключает только совпавшие sessions, поэтому задержанное/повторное событие не отзывает новый login после unblock. Broker reconnect перепроверяет sockets; DB checks закрывают delivery и при RabbitMQ outage. После commit новые access checks запрещают доступ; уже начатые запросы/handshake/delivery могут завершиться, все in-flight действия не прерываются.

**Проверки и остающиеся условия:** automated local prerequisite и revoke/disconnect на двух Nest HTTP/WS Gateway instances с реальным disposable RabbitMQ подтверждены; это не staging/two Kubernetes pod. Изолированный PostgreSQL: новая migration через Prisma migrate deploy поверх baselined предыдущей схемы с User/Profile/Session/AdminSession fixtures; outcomes/audit/rollback/concurrency, login/refresh races, REST, WS, DB failure, broker pause/retry/restarted publisher, lease recovery, delayed/duplicate revoke. Google upstream и часы — тестовые замены; delete — только fixture, не use case. Технический/security review и эксплуатационная проверка bindings/reconnect/scheduler/monitoring/clock sync на реальном deployment остаются до production-приёмки. Карточка 3 остаётся с открытым AC profile route; публичные данные/paid auto-renew после delete, social source/columns, fixed credentials purpose/rotation owner и origins не выдуманы. Карточка 4 не объявляется принятой без review. Полная карта каналов, ошибки, retry и команды тестов — FE guide, раздел 4B. Нумерация и scope карточек сохранены.

**Результат:** two ordered sub-results: **A** introduces persisted blocked/audit model for consumers; **B** supplies block/unblock and immediate all-channel enforcement.

**Исторический результат 4A (объединён до карточки 3):** миграция `20261018130000_add_user_state_audit` после AdminSession добавляет `User.isBanned NOT NULL DEFAULT false` и persistent `AdminUserActionAudit` в Gateway PostgreSQL. Entity/mapper читают фактическое значение; обычный User update намеренно не записывает `isBanned`, в том числе из устаревшей entity. На этапе 4A пользовательские DTO и авторизация не расширялись; актуальный результат 4B описан ниже. Маршрут 4A → 3 → 4B сохранён.

Внутренний контракт: `UserAccessStateQuery.findByUserId({ userId, transaction? }): Promise<UserAccessState | null>`, где `null` — отсутствующая запись, иначе `ACTIVE | BLOCKED | DELETED`; приоритет `deletedAt != null` → DELETED, затем `isBanned` → BLOCKED, иначе ACTIVE. ACTIVE не подтверждает email/password/session и не выдаёт право доступа. Query читает только `isBanned`/`deletedAt` через отдельный `findUnique`, включая deleted; обычные repositories по-прежнему скрывают deleted. Общие типы — `libs/common/types/user-access-state.ts`; DI — `UserStateAuditModule` (также re-export из `UsersModule`). Ни один auth channel к query в 4A не подключён.

Audit owner — Users+Sessions/security. `AdminUserActionAuditWriter.append({ entry, transaction }): Promise<{ auditId: string }>` принимает типизированный `AdminUserActionAuditEntry` из `libs/common/types/admin-user-action-audit.ts`: action/outcome образуют discriminated union ровно согласованных пар; runtime validator и DB CHECK запрещают несовместимые пары. Сохраняются только id/action/targetUserId/outcome/occurredAt/adminSessionId. Target ID — строка, в том числе отсутствующий User; adminSessionId — UUID идентификатор из principal, не token/hash. FK на User/AdminSession нет: NOT_FOUND допустим, отзыв/замена/очистка admin session не удаляют историю. Только PK, без индексов для несуществующего audit-read API. Общая admin account не идентифицирует человека.

Writer требует живой `transaction` из существующего `ITransactionManager.execute`; Prisma-типы остаются в infrastructure. Manager регистрирует handle на время awaited callback, writer отклоняет root client/отсутствующий/завершённый handle без autocommit fallback. В 4B/05 изменения User, отзыв Sessions и append должны выполняться внутри **одного** callback; NOT_FOUND — отдельный короткий callback только с append. Пример существующего API (не реализация команды):

```typescript
await transactionManager.execute(async (transaction) => {
  // В 4B/05 здесь выполнятся User/Sessions repository writes с тем же transaction.
  return auditWriter.append({ entry, transaction });
});
```

Каждый append создаёт новую строку; дедупликации отдельных запросов и гарантии «одна строка на завершённую команду» на этапе 4A нет. Последнюю обеспечат use cases 4B/05. Проверки 4A — `test/superadmin/user-state-audit.integration-spec.ts`: предыдущая схема с fixtures User/Profile/Sessions/AdminSession, migration/default/mapping, приоритет state/deleted reads, все 11 пар и invalid pair, NOT_FOUND, общая commit/rollback transaction, session lifecycle/audit retention и отсутствие secret fields. БД — отдельный disposable PostgreSQL Docker container, не shared/production; миграционный SQL выполняется поверх всех предыдущих миграций. На этапе 4A runtime SDL не менялся и содержал только три auth operations SA-GQL-02; текущая schema расширена реализованными карточками 3/4B.

**SOW A:** `isBanned` entity/schema/migration, admin state read contract and `AdminUserActionAudit` writer/model; no command exposure or access behavior change. **SOW B:** commands, transactional session revoke/audit, state checks in REST JWT/refresh/GraphQL user auth/notification WS, confirmed revoke event/disconnect and delivery-state check. **Out:** reason field, delete, payments/follow. **Owner/files:** Users+Sessions/security; schema/migration, User repository/entity, auth strategy/refresh, session, notification WS, resolver. **Contract:** exact Block/Unblock enums. **Start A:** SA-GQL-02 completed/merged and common contract reviewed for the agreed single-developer route; **Start/develop B:** merged A and two-pod RabbitMQ prerequisite; in the agreed route B follows completed SA-GQL-03. **Merge/accept B:** SA-GQL-02 verifier merged before runtime mutation/schema publication. **PR order:** merge A, leave card 4 open, complete 03, then B; 03 and B can technically develop in parallel after A. **AC A:** migration preserves existing users with factual `isBanned=false`, admin read returns persisted state, audit schema accepts required fields; no runtime block operation is published. **AC B:** blocked user cannot login/refresh/REST/GraphQL protected/WS old token; sessions gone; unblock new login; deleted not unblocked; repeat/concurrent outcomes and audit rows match section 4; two-pod revoke/disconnect test passes. **DoD:** A migration/repository tests; B transaction/concurrency/all-channel/delivery tests, security docs and FE status via 01 owner. **Risk/errors:** omitted channel breaks immediate revoke; `USER_DELETED`/`NOT_FOUND` semantics; intended compatibility change.

### 5. SA-GQL-05 — Мягкое удаление пользователя

**Результат:** delete yields `DELETED`, soft-deletes, revokes sessions/prevents access, preserves payment history.

**SOW:** admin-state read including deleted; command transaction plus audit writer; access-hook/revoke-event completion; payload/resolver; disposable-fixture runbook. **Out:** restore/hard delete, public-data cleanup, subscription cancel/refund, UI dialog. **Owner/files:** Users+Sessions; entity/repo/query, command/use case, resolver; schema merge serialized with 04A. **Contract:** `{ userId, outcome }`, never required user object. **Start/dependencies:** after completed and merged 04B; uses auth 02, state/audit 04A, enforcement 04B and completed catalogue/detail 03 for exclusion checks. **AC:** active/blocked deleted; old protected token fails; completed 03 list and detail exclude user; `ALREADY_DELETED` vs `NOT_FOUND`; delete wins race; payment history remains; one compliant audit record per result; active sockets are revoked via confirmed fan-out after commit. **DoD:** atomic rollback/concurrency/access-after-delete/audit/revoke failure tests, Swagger disposable-user procedure/policy links and FE document status via 01 owner. **Production acceptance:** agreed public-data and active auto-renew policies required. **Risk/errors:** `ALREADY_DELETED`/`NOT_FOUND`, public data/autorenew unresolved; in-flight request may complete by defined policy.

### 6. SA-GQL-06 — Вкладка Payments

**Результат:** `superadminUser.payments` returns target-user paginated payment history; outage preserves base detail.

**SOW:** implemented Payment SDL fragment, gateway adapter/query/field resolver after guard, bounded page/upstream mapping and explicit timeout; reuse `GetPaymentHistory`. **Out:** new RPC/proto unless criteria in section 6, Stripe lifecycle/cancel/refund. **Owner/files:** gateway Payments `modules/payments/**` + field resolver; Payment MS owner only if proto change. **Contract:** existing proto + nullable field boundary. **Start/dependencies:** after SA-GQL-05 completed, accepted and merged; uses `superadminUser` from 03 and admin auth from 02; payment fragment approved. **AC:** selected ID reaches existing RPC, stable items/metadata, empty history succeeds; normal user denied; unavailable/timeout gives null `payments` + `UPSTREAM_UNAVAILABLE` while base user stays. **DoD:** adapter/field/error/timeout tests, proto compatibility, runtime fragment and planned/implemented FE section submitted through 01 owner. **Risk/errors:** upstream timeout/outage; gRPC no caller role, so gateway guard/network boundary mandatory.

### 7. SA-FOLLOW-DISCOVERY — Исследование источника Followers/Following

**Результат:** reviewed ADR с источником social graph, владельцем и контрактом либо подтверждённым отсутствием пригодного источника; уточнение технического контракта карточки 8 в пределах её согласованного scope, не реализация вкладок.

**SOW:** inventory bounded contexts/data stores; confirm ownership, relationship direction, privacy, deleted/blocked semantics, columns, pagination, transport and authorization; document whether an existing context can be extended. **Out of scope:** изменение рабочего кода, создание/расширение источника, Follow MS, migration, GraphQL field, placeholder data. **Ответственный/файлы:** Architecture owner с Product и owners Users/Post/Payment как consultees; reviewed ADR/исследовательская документация. **Вход/выход:** UC-6/current code → ADR с доказательствами, owner/contract или отсутствием источника. **Start/dependencies:** после завершения, приёмки и merge карточки 6. **AC:** reviewed ADR фиксирует источник/владельца/контракт либо подтверждённое отсутствие; Payments исключены; точные колонки и ограничения карточки 8 документированы либо обозначены открытыми. **DoD:** review sign-off, handoff карточке 8 и status FE guide через owner 01; проверки соответствуют исследовательскому результату, не меняют код. **Ошибки/риски:** отсутствие источника — валидный результат, не пустые данные и не реализация; могут понадобиться отдельно согласованные подготовительные задачи с владельцем, объёмом и местом в очереди.

### 8. SA-GQL-08 — Реализация Followers/Following

**Результат:** after approved source, distinct real paginated relationships; never payment/fake empty values.

**SOW:** consume discovered source/contract; agreed fields/privacy/state behavior; resolver/batching. **Out:** creating or extending absent source/service without separate agreement, zero placeholders. **Owner/files:** assigned after `SA-FOLLOW-DISCOVERY`; gateway fragment + source owner. **Contract:** unfinished until discovery; absent from runtime SDL until implementation. **Start/dependencies:** only after accepted card 7 and ready source. If source must be created/extended, this card stays **Blocked**; separately agree preparatory work, its owner, scope and queue position, without silently adding it to the nine cards or assuming it done. Do not proceed to card 9 instead of blocked 8. **AC:** distinct real sets, paging/privacy/state, no N+1 for supported shape. **DoD:** source integration/contract/security tests; implemented section/examples submitted through 01 owner. **Errors/risks:** source unavailable maps to agreed error, never false empty data; UC-6 remains incomplete while blocked.

### 9. SA-GQL-09 — Сквозная приёмка и итоговая документация для фронтенда

**Результат:** verified scope and finalized `GRAPHQL_SUPERADMIN_FRONTEND_API.md`: it was created by 01 with planned contract, then updated per feature, and now has verified implemented examples. Second MD is not created in this planning turn.

**SOW:** cross-card security/schema/contract tests, UC matrix, disposable fixture runbook, verify existing guide URL/auth/operations/variables/nullability/page/search/sort/errors/examples/list refresh against actual schema. **Out:** FE implementation, production deployment, live account deletion, unimplemented Follow API. **Owner/files:** gateway integration; `apps/main-gateway-service/test/superadmin/**`, existing root FE MD, with SA-GQL-01 document integrator. **Start/dependencies:** only after SA-GQL-08 completed, accepted and merged; cards 1–8 and all agreed preparatory work must be complete. **AC:** checks below pass; manual delete new Swagger fixture; guide operations labelled planned/implemented correctly and examples execute against actual schema; no full-ready claim with mandatory requirements open. **DoD:** target build/tests/schema snapshot/docs agree; no secrets/real IDs; integrator accepts feature changes. **Errors/risks:** missing mandatory implementation or contract mismatch blocks acceptance; cannot bypass blocked 8 or certify UC-6 with unresolved social graph.

## 9. Coverage, open questions, merge

| ТЗ/проверка | Карточки | Статус |
|---|---|---|
| UC-1 / login/logout/admin-only | SA-GQL-01, SA-GQL-02, SA-GQL-09 | planned; login purpose/rotation open |
| UC-2 list, 8 latest, actions | SA-GQL-01, SA-GQL-03, SA-GQL-04 (4A/4B), SA-GQL-05, SA-GQL-09 | catalogue waits 4A; URL nullable pending route |
| UC-3 confirmed delete/disposable | SA-GQL-05, SA-GQL-09 | UI confirmation FE; backend after 4B and 03 |
| UC-4/5 search/sort/page | SA-GQL-03, SA-GQL-09 | proposal compatible with model |
| UC-6 base/Payments | SA-GQL-03, SA-GQL-06, SA-GQL-09 | reuse selected; 06 after 05 |
| UC-6 Followers/Following | SA-FOLLOW-DISCOVERY, SA-GQL-08, SA-GQL-09 | 08 blocked until accepted discovery and ready source |
| no admin/ordinary token; nested guard | SA-GQL-01, SA-GQL-02, SA-GQL-09 | mandatory |
| old token revoked/block/delete; unblock new login | SA-GQL-04 (4B), SA-GQL-05, SA-GQL-09 | mandatory; two-gateway WS prerequisite |
| repeat/concurrency/upstream/validation | SA-GQL-03–06, SA-GQL-09 | mandatory |

| Открытый вопрос | Ответственный | Блокирует |
|---|---|---|
| fixed credentials: purpose outside educational check, secret owner and rotation procedure | Product + Security | production acceptance SA-GQL-02; not the fixed training login or independent infrastructure start |
| exact public profile route | Frontend/Product | concrete profileUrl criterion of SA-GQL-03; nullable catalogue implementation may start independently |
| posts/files/comments/public profile/notifications after delete | Product + Post/File/Users | production acceptance SA-GQL-05; not core implementation start |
| active auto-renew after delete | Product + Payment | production acceptance SA-GQL-05; SA-GQL-06 history read does not cancel or modify it |
| Follow source/owner and exact table columns, privacy/page | Architecture + Product (`SA-FOLLOW-DISCOVERY`) | start of SA-GQL-08 requires accepted discovery and ready source; full UC-6/SA-GQL-09 acceptance remains blocked otherwise |
| GraphQL dependency version/production introspection | Platform/Security | dependency review before SA-GQL-01 implementation |
| two-gateway RabbitMQ fan-out/revoke topology | Gateway platform + Security | SA-GQL-04B implementation prerequisite and its acceptance test |

**Назначение:** все девять карточек можно создать; 1–7 и 9 можно назначить соответствующим ролям заранее, owner реализации 8 определяется исследованием 7. Назначение не означает разрешения на начало или приёмку.

**Начало и приёмка:** основной маршрут — 1 → 2 → 4A → 3 → 4B → 5 → 6 → 7 → 8 → 9. 4A/4B остаются в карточке 4, которая принимается после B. 5 начинает после завершения и merge 4B и использует принятую 3; 6 начинает после завершения, технической приёмки и merge 5; 7 — после завершения, приёмки и merge 6; 8 — после принятия 7 и готовности источника; 9 — только после завершения, приёмки и merge 8. Если 8 Blocked из-за источника, переход к 9 запрещён. Техническая приёмка 5 и её merge для дальнейшей разработки не равны production-приёмке: последняя дополнительно ждёт обеих политик delete.

**PR/merge:** 01 infrastructure + target SDL/planned FE guide → 02 AdminSession → 04A state/audit → 03 catalogue → 04B enforcement, завершение 04 → 05 delete → 06 Payments → 07 reviewed ADR → 08 social fields только после готовности источника → 09 final verification. При необходимости подготовительные работы источника согласуются отдельно, с владельцем, scope и местом в очереди; они не входят автоматически в девять карточек. Gateway Prisma migrations 02/04A/05 сериализуются; runtime SDL публикуется только вместе с рабочими resolver и тестами.

## 10. Общий Definition of Done

- Thin resolvers/use cases; no Prisma domain; `DomainException`, named exports/kebab-case/explicit types follow repository rules.
- Administrative data, nested fields and mutations other than login/logout fail closed without a valid admin session; login is permitted without one, and logout permits safe idempotent cookie cleanup without a valid session while retaining applicable Origin/CSRF checks. Neither exception grants other admin access; normal user behavior change is intentional and tested.
- No secret in code/bundle/logs/tests/docs; only isolated fixtures; manual delete only new Swagger disposable user.
- Pagination/search/sort/null Profile/repeats/concurrency/state/upstream boundaries are tested.
- Internal compatibility/no-N+1 proven for implemented shapes; Payments never become Following.
- SA-GQL-01 creates `GRAPHQL_SUPERADMIN_FRONTEND_API.md` only after target-contract review; feature owners route planned/implemented section updates through its document integrator; SA-GQL-09 validates examples against actual schema and closes the document. No full-ready claim while mandatory social/external questions remain.
