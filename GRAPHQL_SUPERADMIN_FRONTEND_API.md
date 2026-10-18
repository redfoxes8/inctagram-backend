# Superadmin GraphQL API — контракт 1.1.0

Статус: целевой контракт подготовлен в SA-GQL-01; техническая сверка с планом и `payment.proto` выполнена. Это не согласование с человеком: review Platform/Security и Frontend остаётся открытым. Перед принятием контракта проверить nullable Profile/Payments, outcomes, бюджет запросов, origin allow-list и незавершённый social scope. Проверенные инфраструктурные тесты не подтверждают будущую авторизацию SA-GQL-02.

## URL и текущая доступность

Целевой URL: `/api/v1/graphql` на Gateway. **Runtime endpoint отключён**, пока нет реализованного Query root. Нет опубликованных Users, Payments, Followers/Following или login/logout. В приложении подключён `SuperadminModule` без `withRuntime`; тестовая schema находится только в `test/superadmin` и не подключается production-приложением. Нельзя подключать целевой SDL целиком ради запуска сервера.

**Согласованное дополнение:** пользователь утвердил защищённую query `superadminSession: SuperadminSessionPayload!` с `authenticated: Boolean!` в целевом контракте 1.1.0. В SA-GQL-02 endpoint включается после реализации этой query, login/logout и session verifier; каталог карточки 3 для этого не требуется. Это настоящее чтение подтверждённого состояния текущей admin session: действующая session → `{ authenticated: true }`, отсутствие действующей session → `UNAUTHENTICATED`. Query не является публичным исключением, не возвращает token/cookie/hash/credentials. Сейчас она добавлена только в целевой SDL; resolver, session storage и verifier остаются работой карточки 2. Фактический Nest Apollo startup с mutation-only SDL по-прежнему недопустим, но согласованная query устраняет этот вопрос перехода после её реализации.

Целевой SDL: `libs/contracts/src/graphql/superadmin/v1/target.graphql`, версия `1.1.0`. Общий schema-first fragment: `common-type-defs.ts` рядом; DateTime и pagination DTO — `libs/common/src/graphql`. Target SDL валидируется тестом, runtime schema собирается отдельно из реализованных feature fragments.

## Планируемые operations

Все операции таблицы имеют статус **Запланировано**.

| Operation                 | Input                                      | Output                                                        | Карточка                      |
| ------------------------- | ------------------------------------------ | ------------------------------------------------------------- | ----------------------------- |
| `superadminLogin`         | `SuperadminLoginInput { email, password }` | `{ authenticated: Boolean! }`, future cookie                  | 2                             |
| `superadminLogout`        | нет                                        | `{ loggedOut: Boolean! }`                                     | 2                             |
| `superadminSession`       | нет                                        | `SuperadminSessionPayload! { authenticated: Boolean! }`       | **Запланировано — SA-GQL-02** |
| `superadminUsers`         | `SuperadminUsersInput`                     | items, totalCount, pageInfo                                   | 3                             |
| `superadminUser`          | `userId: ID!`                              | nullable SuperadminUser                                       | 3                             |
| `superadminBlockUser`     | `{ userId: ID! }`                          | userId, BLOCKED / ALREADY_BLOCKED / NOT_FOUND / USER_DELETED  | 4B                            |
| `superadminUnblockUser`   | `{ userId: ID! }`                          | userId, UNBLOCKED / ALREADY_ACTIVE / NOT_FOUND / USER_DELETED | 4B                            |
| `superadminDeleteUser`    | `{ userId: ID! }`                          | userId, DELETED / ALREADY_DELETED / NOT_FOUND                 | 5                             |
| `SuperadminUser.payments` | `PageInput!`                               | nullable PaymentConnection                                    | 6                             |

Followers/Following не определены в SDL: источник, колонки и технический контракт ждут исследования **карточки 7 SA-FOLLOW-DISCOVERY**, реализация — **карточка 8 SA-GQL-08**. Отсутствие источника не есть пустой реальный список. Итоговая сверка документа и исполняемых примеров — **карточка 9 SA-GQL-09**.

Пример целевой операции (**Запланировано — SA-GQL-02**, сейчас не исполняется):

```graphql
query CurrentSuperadminSession {
  superadminSession {
    authenticated
  }
}
```

При действующей session будущий ответ: `{"data":{"superadminSession":{"authenticated":true}}}`. Без действующей session — `{"data":null,"errors":[{"message":"Authentication required","path":["superadminSession"],"extensions":{"code":"UNAUTHENTICATED"}}]}`. Frontend использует query для проверки текущей admin session: `UNAUTHENTICATED` означает необходимость входа. Сетевой сбой, timeout и другие технические ошибки не следует автоматически трактовать как отсутствие session. Эти примеры описывают согласованный будущий контракт, не проверенный session flow.

## Типы и nullable-поля

`DateTime` — ISO-8601 UTC (`YYYY-MM-DDTHH:mm:ss[.SSS]Z`), сериализуется с миллисекундами. ID — строковый идентификатор, будущие feature DTO проверяют соответствующий UUID. `SuperadminUserState`: ACTIVE/BLOCKED; email confirmation — отдельный `isEmailConfirmed`. ACTIVE не отменяет существующие проверки входа.

List/detail: `userId`, `createdAt`, `state`, `isEmailConfirmed` non-null. `username`, `profileUrl`, `avatarUrl` nullable: Profile optional в текущей Prisma model. Detail без Profile возвращает null этих полей. Отсутствующий/deleted User — null detail. Public profile route не подтверждён, URL не выдумывать; дата создания берётся из User.

Payments: existing `GetPaymentHistory(user_id,page,page_size)` предоставляет transactionId, createdAt, paidAt, amountMinor (целые minor currency units), currency, productId/productName, billingInterval/Count, provider, kind, status, checkoutPurpose, subscriptionId/EndsAt. Optional paidAt/checkoutPurpose/subscriptionId/subscriptionEndsAt остаются nullable. Будущая интеграция сохраняет current user detail при timeout/outage: `payments: null` + error `UPSTREAM_UNAVAILABLE`, не ложный пустой список. Точные отображаемые колонки требуют Product review; Stripe lifecycle не меняется.

## Pagination, search, sort (целевое поведение)

`page` 1..10 000, default 1; `pageSize` 1..50, default 8. `PageInfo`: page, pageSize, pagesCount, hasNextPage; `totalCount` относится к фильтру. Успешная страница вне диапазона данных — пустые items с корректной metadata. Невалидные bounds — BAD_USER_INPUT. DTO `PaginationInput` должен применяться к `@Args('input')` каждой реализованной feature; декларация SDL сама не проверяет диапазоны.

Планируемый каталог: все неудалённые, включая blocked/unconfirmed. `searchUsername`: trim, substring, case-insensitive; пустой поиск отключает фильтр; поиск до count/page. Sort: USERNAME_ASC/DESC или CREATED_AT_ASC/DESC (default DESC). Nullable username всегда в конце обеих алфавитных сортировок; ID — стабильный tie-breaker в выбранном направлении. Эти data-функции ещё не реализованы.

## Auth, HTTP и CSRF

**Обычный user JWT не даёт admin-доступ.** Сейчас default verifier всегда отказывает. Будущий verifier SA-GQL-02 получает только `superadminSession` token из cookie; Authorization bearer и `req.user` не используются как admin principal. Все административные root/nested resolvers защищаются global guard и `fieldResolverEnhancers: ['guards', 'filters']`.

Запланирована отдельная opaque admin session: сервер хранит hash, cookie HttpOnly, Secure production, Path `/api/v1/graphql`. SameSite=Lax в одном site или None; Secure для cross-site после браузерной проверки. Idle expiry 30 минут, absolute expiry 8 часов, activity update не чаще раза в минуту, absolute срок не продлевается. Повторный login текущего браузера заменяет/отзывает его session; другие браузеры независимы.

Login и безопасная идемпотентная очистка logout — будущие scoped session exceptions (`SuperadminSessionException`). Guard разрешает exception только на root Mutation с точным именем login/logout; он не разрешает вложенные данные. Logout без действующей/с expired/revoked session допускает `{ loggedOut: true }` с очисткой cookie; действующий logout отзывает только текущую session. Эти mutations и cookie issuance **не реализованы**.

HTTP primitives: POST + application/json; OPTIONS только для CORS preflight, не исполнения GraphQL. `SUPERADMIN_ALLOWED_ORIGINS` — comma-separated exact HTTP(S) origins без path/wildcard. Точные origins frontend суперadminки не подтверждены; их настройка необходима до браузерной проверки рабочего входа в SA-GQL-02. Пустой allow-list отказывает всем; неизвестный или отсутствующий Origin запрещён. Credentials=true, preflight допускает Content-Type и X-Superadmin-CSRF. Разные origins не означают разные sites.

First login: Origin allow-list + JSON-only. После выдачи будущих session/CSRF cookies SA-GQL-02 заголовок `X-Superadmin-CSRF` должен совпадать с `superadminCsrf` cookie (timing-safe compare). При cookie-authenticated mutation guard проверяет nonce. Logout с session cookie тоже проверяет nonce; logout без session допускает только безопасную очистку при Origin/JSON checks. Отсутствие валидного principal не препятствует этой очистке. Сейчас infrastructure не выдаёт cookies и не доказывает защиту полного session flow.

## Errors и бюджеты

GraphQL envelope `errors[]`: безопасное message, optional path, только `extensions.code`. Коды: UNAUTHENTICATED, FORBIDDEN, BAD_USER_INPUT, INTERNAL_SERVER_ERROR, NOT_FOUND, CONFLICT, UPSTREAM_UNAVAILABLE; GraphQL validation/parse отличаются кодами GRAPHQL_VALIDATION_FAILED/GRAPHQL_PARSE_FAILED. Stack, secrets, raw upstream details, cookies/tokens не публикуются. Бизнес-outcomes mutations относятся к data payload.

```json
{
  "errors": [{ "message": "Authentication required", "extensions": { "code": "UNAUTHENTICATED" } }]
}
```

Максимум body 256 KiB; depth 8, complexity 200. Каждый field и alias стоит единицу; fragment расширяется при каждом использовании, циклы отвергаются. Connection `items` умножает стоимость вложенных полей на pageSize (default 8). Бюджет проверяется при validation и заново с variables перед исполнением, суммарно для operations документа. HTTP batching запрещён; subscriptions не поддерживаются. В production introspection запрещена, IDE/landing page отключены во всех средах. REST настройки не расширяются этим endpoint.

## Подключение SA-GQL-02 и владение

1. Owner 01 интегрирует root/common SDL и проверяет feature fragment; target SDL не импортировать в runtime. Все root/nested fields публикуются только с реализованными resolvers и tests.
2. После реализации согласованной `superadminSession`, login/logout и session verifier SA-GQL-02 меняет plain import на `SuperadminModule.withRuntime({ typeDefs: implementedSdl, production: coreConfig.env === 'production' })`, добавляет реализованные resolver providers и заменяет binding `AdminPrincipalVerifier` в этом module на свой session verifier (либо factory/useExisting с явным импортом owner модуля). Одних login/logout mutations недостаточно; `superadminSession` обеспечивает реальный Query root и остаётся под общей защитой. Нельзя регистрировать второй одноимённый binding в соседнем module и ожидать, что он заменит default.
3. `setupSuperadminHttp` уже установлен в bootstrap до общего parser/CORS; сохранять этот порядок и exact path. GraphQL config использует `/graphql` + `useGlobalPrefix: true`, итог — `/api/v1/graphql`, без двойного prefix.
4. Feature owners передают изменения planned/implemented sections document integrator SA-GQL-01. Владение User — карточка 3, block — 4, delete — 5, Payments — 6, social research — 7, social implementation — 8; окончательный verifier — карточка 9.

Открытые решения: public profile route (Frontend/Product); social source/columns (Architecture/Product); public data и active paid auto-renew после delete (Product + Post/File/Payment); назначение fixed credentials вне учебной проверки и rotation owner (Product/Security). Техническая сверка SA-GQL-01 их не закрывает. Документ не содержит реальных credentials, user data или tokens.

## Совместимость и технический review

Проверены Node 22.13.1 (Docker Node 22), PNPM 10.13.1, Nest 11.1.19, Express 5.2.1. Новые fixed deps: `@nestjs/graphql`/`@nestjs/apollo` 13.4.5 (peers Nest ^11.0.1), `@apollo/server` 5.5.1 (Node >=20, graphql ^16.11), `@as-integrations/express5` 1.1.2 (Express ^5), `graphql` 16.14.2. Express 5.2.1 объявлен напрямую для HTTP primitives (уже используется platform adapter). Apollo client не нужен.

Источники review: [Nest GraphQL quick start](https://docs.nestjs.com/graphql/quick-start), [field enhancers](https://docs.nestjs.com/graphql/other-features), [Apollo Express middleware](https://www.apollographql.com/docs/apollo-server/api/express-middleware), peerDependencies из npm registry выбранных версий. `@nestjs/apollo` транзитивно тянет deprecated Playground plugin с peer Apollo 4, но `playground:false` и explicit disabled landing page исключают его использование; существующие RabbitMQ/Prisma peer warnings не устраняются сторонним обновлением.

Фактические install-команды Dockerfiles проверены в изолированных временных каталогах: `pnpm install --frozen-lockfile` и Gateway-команда `npm install --no-audit --no-fund --legacy-peer-deps` завершились с exit 0. Playground warning их не заблокировал; manifest/lockfile и строгие настройки рабочего дерева не менялись. Это локальное воспроизведение команд, не полный запуск Jenkins/Linux deployment с неизвестными внешними настройками; подробные ограничения записаны в `SA_GQL_01_REVIEW.md`.

Проверка в ветке SA-GQL-01: Gateway build прошёл; 20 тестов в трёх наборах (`superadmin-infrastructure`, `jwt-token-type`, `payment-history-extension`) прошли без подключения к внешним сервисам. Инфраструктурная schema проверяет fail-closed DI, root/nested guard, безопасные ошибки с настоящим app setup, DTO bounds, HTTP/CORS/CSRF, body/depth/complexity, aliases/fragments/default variables, batching, disabled runtime и REST response regression. Это не тестирование будущих sessions, бизнес-операций или production окружения.

Точечный review добавил два теста: отказ реального Nest Apollo startup с mutation-only schema и HTTP 403 при пустом origin allow-list. Обновлённый инфраструктурный набор: 16/16; исходная REST-проверка ошибок уже проверяла status 400 и точный envelope `code/message/extensions`. Остальные ранее прошедшие наборы в этом проходе повторно не запускались.

Для дополнения 1.1.0 отдельно проверены полный SDL через `buildSchema`/`assertValidSchema`, тип `SuperadminSessionPayload` и пример query через `validate`. Повторно запущены только две релевантные существующие проверки target contract и disabled runtime: 2 passed, 14 skipped. Полная сборка и session flow не запускались; runtime остаётся отключённым.
