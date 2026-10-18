# Superadmin GraphQL API — контракт 1.1.0

Статус: целевой контракт 1.1.0; реализованы auth subset SA-GQL-02 и каталог/основные детали SA-GQL-03, кроме открытого AC публичной ссылки профиля (`profileUrl: null`). Версия не меняется: реализованы ранее согласованные поля. Это не production-приёмка и не согласование с человеком: review Platform/Security и Frontend остаётся открытым. Перед принятием всего контракта проверить nullable Profile/Payments, outcomes, бюджет запросов, origin allow-list и незавершённый social scope.

## URL и текущая доступность

Фактический URL: `/api/v1/graphql` на Gateway (POST JSON). **Runtime endpoint включён** через `SuperadminModule.withRuntime`; опубликованы `superadminSession`, `superadminLogin`, `superadminLogout`, `superadminUsers`, `superadminUser`. Runtime composition — `libs/contracts/src/graphql/superadmin/v1/runtime-type-defs.ts`: только `auth-type-defs.ts` и `users-type-defs.ts`; target SDL целиком не загружается. Payments, block/unblock/delete, Followers/Following не опубликованы. Пустой `SUPERADMIN_ALLOWED_ORIGINS` по-прежнему запрещает все admin HTTP-запросы, включая login.

**Согласованное дополнение реализовано в SA-GQL-02:** защищённая query `superadminSession: SuperadminSessionPayload!` с `authenticated: Boolean!` читает состояние текущей admin session. Действующая session → `{ authenticated: true }`, отсутствие действующей session → `UNAUTHENTICATED`. Query не является публичным исключением и не возвращает token/cookie/hash/credentials; каталог карточки 3 для валидного Query root не требуется.

Целевой SDL: `libs/contracts/src/graphql/superadmin/v1/target.graphql`, версия `1.1.0`. Общий schema-first fragment: `common-type-defs.ts` рядом; DateTime и pagination DTO — `libs/common/src/graphql`. Target SDL валидируется тестом, runtime schema собирается отдельно из реализованных feature fragments.

**SA-GQL-04A — подготовлена только внутренняя модель:** `User.isBanned` с default false и persistent `AdminUserActionAudit` в Gateway DB. `UserAccessStateQuery` различает ACTIVE/BLOCKED/DELETED и отсутствие записи (`null`), но не выполняет авторизацию; ACTIVE не отменяет email confirmation и другие проверки. State-read/audit writer экспортирует `UserStateAuditModule`, owner — Users+Sessions/security. Writer принимает согласованные action/outcome и явный живой tx существующего transaction manager для общей транзакции User/Sessions/audit в будущих 4B/05; подробный API — в карточке 4 плана. Это **не** включение блокировки в действующие login/refresh/guards/WS. Каталог/основные детали реализованы в карточке 3 с использованием фактического isBanned; mutations остаются запланированы в 4B/5. Карточка 4 целиком не завершена.

## Operations и статусы

**Реализовано — SA-GQL-02:** `superadminLogin`, `superadminLogout`, `superadminSession`. **Реализовано — SA-GQL-03:** `superadminUsers`, `superadminUser` (ссылка профиля пока null). Остальные операции таблицы — **Запланировано**.

| Operation                 | Input                                      | Output                                                        | Карточка                    |
| ------------------------- | ------------------------------------------ | ------------------------------------------------------------- | --------------------------- |
| `superadminLogin`         | `SuperadminLoginInput { email, password }` | `{ authenticated: Boolean! }`, HttpOnly cookie                | **Реализовано — SA-GQL-02** |
| `superadminLogout`        | нет                                        | `{ loggedOut: Boolean! }`                                     | **Реализовано — SA-GQL-02** |
| `superadminSession`       | нет                                        | `SuperadminSessionPayload! { authenticated: Boolean! }`       | **Реализовано — SA-GQL-02** |
| `superadminUsers`         | `SuperadminUsersInput!`                    | items, totalCount, pageInfo                                   | **Реализовано — SA-GQL-03** |
| `superadminUser`          | `userId: ID!`                              | nullable SuperadminUser                                       | **Реализовано — SA-GQL-03** |
| `superadminBlockUser`     | `{ userId: ID! }`                          | userId, BLOCKED / ALREADY_BLOCKED / NOT_FOUND / USER_DELETED  | 4B                          |
| `superadminUnblockUser`   | `{ userId: ID! }`                          | userId, UNBLOCKED / ALREADY_ACTIVE / NOT_FOUND / USER_DELETED | 4B                          |
| `superadminDeleteUser`    | `{ userId: ID! }`                          | userId, DELETED / ALREADY_DELETED / NOT_FOUND                 | 5                           |
| `SuperadminUser.payments` | `PageInput!`                               | nullable PaymentConnection                                    | 6                           |

Followers/Following не определены в SDL: источник, колонки и технический контракт ждут исследования **карточки 7 SA-FOLLOW-DISCOVERY**, реализация — **карточка 8 SA-GQL-08**. Отсутствие источника не есть пустой реальный список. Итоговая сверка документа и исполняемых примеров — **карточка 9 SA-GQL-09**.

Реализованная операция (**SA-GQL-02**):

```graphql
query CurrentSuperadminSession {
  superadminSession {
    authenticated
  }
}
```

При действующей session: `{"data":{"superadminSession":{"authenticated":true}}}`. Без действующей session: `{"data":null,"errors":[{"message":"Authentication required","path":["superadminSession"],"extensions":{"code":"UNAUTHENTICATED"}}]}`. Frontend использует query для проверки текущей admin session: `UNAUTHENTICATED` означает необходимость входа. Сетевой сбой, timeout, `UPSTREAM_UNAVAILABLE` и другие технические ошибки не следует автоматически трактовать как отсутствие session. Auth flow проверяется автоматизированно с изолированной PostgreSQL; неизвестное реальное browser deployment этими проверками не подтверждается.

## Типы и nullable-поля

`DateTime` — ISO-8601 UTC (`YYYY-MM-DDTHH:mm:ss[.SSS]Z`), сериализуется с миллисекундами. `superadminUser` проверяет строковый UUID через принятую в проекте `@IsUUID()`; некорректный ID → `BAD_USER_INPUT`. `SuperadminUserState`: ACTIVE/BLOCKED, по фактическому сохранённому `User.isBanned`; email confirmation — отдельный фактический `isEmailConfirmed`. ACTIVE не отменяет существующие проверки входа.

List/detail: `userId`, `createdAt`, `state`, `isEmailConfirmed` non-null. `username`, `profileUrl`, `avatarUrl` nullable: Profile optional в текущей Prisma model. Detail без Profile возвращает null этих полей. Отсутствующий/deleted User — null detail. Public profile route не подтверждён, URL не выдумывать; дата создания берётся из User.

Payments: existing `GetPaymentHistory(user_id,page,page_size)` предоставляет transactionId, createdAt, paidAt, amountMinor (целые minor currency units), currency, productId/productName, billingInterval/Count, provider, kind, status, checkoutPurpose, subscriptionId/EndsAt. Optional paidAt/checkoutPurpose/subscriptionId/subscriptionEndsAt остаются nullable. Будущая интеграция сохраняет current user detail при timeout/outage: `payments: null` + error `UPSTREAM_UNAVAILABLE`, не ложный пустой список. Точные отображаемые колонки требуют Product review; Stripe lifecycle не меняется.

## Pagination, search, sort (реализовано — SA-GQL-03)

`page` 1..10 000, default 1; `pageSize` 1..50, default 8. `PageInfo`: page, pageSize, pagesCount, hasNextPage; `totalCount` относится к фильтру. Успешная страница вне диапазона данных — пустые items с корректной metadata. Невалидные bounds — BAD_USER_INPUT. DTO `PaginationInput` должен применяться к `@Args('input')` каждой реализованной feature; декларация SDL сама не проверяет диапазоны.

Каталог включает всех неудалённых, в том числе blocked/unconfirmed и пользователей без Profile. `searchUsername`: trim, substring, case-insensitive; null/пустой после trim поиск отключает фильтр. Максимум 100 символов **после trim**, превышение → `BAD_USER_INPUT`. Поиск применяется до count/page. `%`, `_`, обратный слеш и кавычки — буквальный текст, не wildcard-синтаксис: параметризованный `strpos(lower(username), lower(parameter))`, не LIKE.

Sort: `USERNAME_ASC`, `USERNAME_DESC`, `CREATED_AT_ASC`, `CREATED_AT_DESC` (default). ID — дополнительный ключ **в том же направлении**. Nullable username всегда в конце обеих алфавитных сортировок. Сортировка выполняется PostgreSQL по collation колонки/БД, без lower/unaccent/transliteration для порядка. Schema не задаёт отдельную collation; фактическая collation production БД не подтверждена. Регистр поиска преобразуется средствами PostgreSQL и его locale. Ненулевой username уникален; совпадающие NULL username и даты упорядочиваются по ID. В изолированной PostgreSQL 16 проверены `datcollate=en_US.utf8`, `datctype=en_US.utf8`; это характеристика тестового окружения, не утверждение о deployed DB.

Count и page читаются **одним SQL statement** с общей MATERIALIZED filtered CTE и LEFT JOIN Profile: один MVCC snapshot, без N+1. Изменения между отдельными запросами страниц могут сдвигать страницы — межзапросного snapshot нет. Для пустой выборки: `items: []`, `totalCount: 0`, `pagesCount: 0`, `hasNextPage: false`. Допустимая страница за пределами списка: пустые items, count/pagesCount всей отфильтрованной выборки, `hasNextPage: false`. Недоступность БД → безопасный `INTERNAL_SERVER_ERROR`, не ложный пустой список/null detail.

Query требует admin cookie и разрешённый Origin, но **не mutation-only CSRF header**. Общий complexity budget 200 сохраняется независимо от pageSize: pageSize=50 разрешён DTO, но слишком широкая selection может превысить бюджет. Уменьшить страницу/selection; aliases и fragments также учитываются.

### Примеры каталога и деталей

```graphql
query Users($input: SuperadminUsersInput!) {
  superadminUsers(input: $input) {
    items {
      userId
      username
      profileUrl
      createdAt
      state
      isEmailConfirmed
    }
    totalCount
    pageInfo {
      page
      pageSize
      pagesCount
      hasNextPage
    }
  }
}
```

Variables: `{"input":{"page":1,"pageSize":8,"searchUsername":"  sample  ","sort":"USERNAME_ASC"}}`. Для defaults: `{"input":{}}`.

Иллюстративный ответ с синтетическими данными (не реальные аккаунты):

```json
{
  "data": {
    "superadminUsers": {
      "items": [
        {
          "userId": "00000000-0000-4000-8000-000000000001",
          "username": "sample",
          "profileUrl": null,
          "createdAt": "2026-10-18T12:00:00.000Z",
          "state": "BLOCKED",
          "isEmailConfirmed": false
        }
      ],
      "totalCount": 1,
      "pageInfo": { "page": 1, "pageSize": 8, "pagesCount": 1, "hasNextPage": false }
    }
  }
}
```

```graphql
query User($userId: ID!) {
  superadminUser(userId: $userId) {
    userId
    username
    avatarUrl
    profileUrl
    createdAt
    state
    isEmailConfirmed
  }
}
```

Variables: `{"userId":"00000000-0000-4000-8000-000000000001"}`. Отсутствующий/soft-deleted пользователь: `{"data":{"superadminUser":null}}`. Без Profile возвращается объект с `username`, `avatarUrl`, `profileUrl` = null, без создания Profile. **Открытый AC:** Frontend/Product должны подтвердить публичный маршрут и его параметр; в доступных frontend-контрактах/документации он не найден. REST URL профиля не доказывает маршрут приложения; пока `profileUrl` всегда null, даже при Profile. Карточка 3 не объявляется полностью принятой.

## Auth, HTTP и CSRF

**Обычный user JWT не даёт admin-доступ.** Рабочий `SessionAdminPrincipalVerifier` получает только `superadminSession` из cookie; Authorization bearer и `req.user` не используются как admin principal. Binding задан внутри `SuperadminModule.withRuntime` через `useExisting` с явным импортом `SuperadminAuthModule`. Без этого binding default verifier отказывает. Все административные root/nested resolvers защищены global guard и `fieldResolverEnhancers: ['guards', 'filters']`.

Отдельная opaque admin session: 32 случайных байта (256 бит), в PostgreSQL только SHA-256 digest. Cookie `superadminSession`: HttpOnly, Secure в production, Path `/api/v1/graphql`, без Domain, Max-Age не превышает оставшийся absolute срок. Не конфликтует с обычным `refreshToken`. Idle expiry 30 минут, absolute expiry 8 часов от создания; activity update не чаще раза в минуту, idle не выходит за absolute. На точной границе expiry доступ уже запрещён. Просроченная/отозванная запись не восстанавливается; условный touch не снимает revoke. Guard может проверять nested поля повторно, но cadence проверяется в repository и не создаёт touch на каждом поле.

Повторный login транзакционно отзывает **предъявленную** прежнюю session и создаёт новую. Сессии других браузеров независимы и не отзываются login/logout текущего. Одновременные login без общего предъявленного token могут создать несколько sessions; сериализация всех конкурентных browser login не обещается. Уже начатый запрос может завершиться при конкурентном revoke; следующий запрос со старой cookie закрыт.

Login и безопасная идемпотентная очистка logout — реализованные scoped exceptions (`SuperadminSessionException`), только root Mutation с точным именем. Они не дают доступа к вложенным административным данным или другим mutations. Logout без действующей/с expired/revoked session возвращает `{ loggedOut: true }` и очищает обе admin cookies. Действующий logout требует CSRF и отзывает только текущую session. Ошибка БД при проверке/отзыве не выдаётся за успешный revoke; cookies не очищаются под ложным успешным ответом.

HTTP primitives: POST + application/json; OPTIONS только для CORS preflight, не исполнения GraphQL. `SUPERADMIN_ALLOWED_ORIGINS` — comma-separated exact HTTP(S) origins без path/wildcard. Точные origins frontend суперadminки не подтверждены; их настройка необходима до браузерной проверки рабочего входа в SA-GQL-02. Пустой allow-list отказывает всем; неизвестный или отсутствующий Origin запрещён. Credentials=true, preflight допускает Content-Type и X-Superadmin-CSRF. Разные origins не означают разные sites.

First login: Origin allow-list + JSON-only, без предварительной session/nonce. Успешные login и защищённый `superadminSession` устанавливают отдельный случайный nonce в HttpOnly cookie `superadminCsrf` (тот же Path/SameSite/Secure; CSRF cookie непостоянная, без Max-Age) и возвращают его в **response header `X-Superadmin-CSRF`**, открытом через `Access-Control-Expose-Headers`. Nonce не содержит session token; FE не читает cookie другого hostname и не ослабляет HttpOnly. Хранить nonce в памяти; после reload выполнить `superadminSession` с credentials и прочитать новый header. Это работает для разных origins при разрешённых cookies; при ротации nonce другой вкладкой повторить bootstrap query перед mutation. Запросы не кешируются (`Cache-Control: no-store`).

Для mutation с действующей session FE отправляет **request header `X-Superadmin-CSRF`**, совпадающий с `superadminCsrf` cookie (timing-safe compare), вместе с browser cookies. В том числе для logout. При отсутствии действующей session logout не требует nonce, но требует разрешённый Origin и JSON. CORS сам по себе не заменяет эти проверки. Preflight допускает Content-Type и X-Superadmin-CSRF. Новую nonce из ответа session query надо сохранить до следующей mutation; игнорировать обновлённую cookie/header пару нельзя.

### Конфигурация и rate limit

Имена в `apps/main-gateway-service/.env.example` и optional secret refs в существующем `deployment.yaml`: `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD_HASH` (bcrypt cost 10..15, как существующее bcrypt средство проекта; plaintext пароль не хранится), `SUPERADMIN_ALLOWED_ORIGINS`, `SUPERADMIN_COOKIE_SAME_SITE`. Email — trim/lowercase; пароль сравнивается без trim, не более 72 UTF-8 bytes (лимит bcrypt). Неверные email/password дают одинаковую ошибку `UNAUTHENTICATED`. Некорректные/отсутствующие admin credentials закрывают login с `UPSTREAM_UNAVAILABLE`, не останавливая обычный REST startup. Обычный user login/refresh не менялся.

`SUPERADMIN_COOKIE_SAME_SITE=lax` — для same-site размещения, включая допустимые разные origins; `none` — cross-site, автоматически Secure даже вне production и требует HTTPS. Другие значения отключают admin login. Выбор определяется фактическим размещением; точные admin origins и cross-site browser compatibility пока **не подтверждены**. Пустой allow-list — deny, не wildcard fallback.

Login ограничен **5 попытками за скользящие 15 минут на комбинацию прямого peer IP и нормализованного email**, включая неверные credentials и успешные входы. Backend — существующий Gateway PostgreSQL, `AdminLoginRateLimit`; transaction advisory lock сериализует попытки одного ключа на всех Gateway, timestamps ограничены пятью. `X-Forwarded-For` не доверяем, unconditional trust proxy не включён; за ingress peer IP может быть общим, это консервативный лимит, не подтверждение end-user IP. Ответ при лимите — `TOO_MANY_REQUESTS`, без раскрытия ключей/счётчиков. Недоступность storage — `UPSTREAM_UNAVAILABLE`, вход закрыт. Часы Gateway должны быть синхронизированы. Истёкшие окна очищаются при следующей попытке того же ключа; индекс updatedAt позволяет операторскую очистку старых rate rows. Retention/очистка revoked sessions должна учитывать будущую audit policy, автоматическое удаление здесь не выполняется.

### Пример клиента (без credentials в исходниках)

Apollo `HttpLink` должен использовать `credentials: 'include'`. JSON отправляется только с разрешённого Origin. Следующий browser-код показывает bootstrap/headers; `endpoint`, `email` и `password` передаются вызывающим кодом, значения не логируются и не сохраняются в bundle:

```javascript
let csrfNonce;
async function adminGraphql({ endpoint, query, variables }) {
  const response = await fetch(endpoint, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfNonce ? { 'X-Superadmin-CSRF': csrfNonce } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  const nonce = response.headers.get('X-Superadmin-CSRF');
  if (nonce) csrfNonce = nonce;
  const result = await response.json();
  if (result.data?.superadminLogout?.loggedOut) csrfNonce = undefined;
  return result; // Inspect errors[].extensions.code; technical errors are not logout.
}
// Login: variables = { input: { email, password } }, supplied at runtime.
// After reload: execute CurrentSuperadminSession first to bootstrap csrfNonce.
```

```graphql
mutation SuperadminLogin($input: SuperadminLoginInput!) {
  superadminLogin(input: $input) {
    authenticated
  }
}
mutation SuperadminLogout {
  superadminLogout {
    loggedOut
  }
}
```

Отправляйте каждую operation отдельным документом; пример login использует runtime variables `{ input: { email, password } }`, не значения из документации.

Login success JSON: `{"data":{"superadminLogin":{"authenticated":true}}}`. Logout success: `{"data":{"superadminLogout":{"loggedOut":true}}}`. Cookies и response CSRF header не являются полями GraphQL payload. Не отправлять пароль/token в GET URL, логи, telemetry или persisted operation variables.

## Errors и бюджеты

GraphQL envelope `errors[]`: безопасное message, optional path, только `extensions.code`. Коды: UNAUTHENTICATED, FORBIDDEN, BAD_USER_INPUT, TOO_MANY_REQUESTS, INTERNAL_SERVER_ERROR, NOT_FOUND, CONFLICT, UPSTREAM_UNAVAILABLE; GraphQL validation/parse отличаются кодами GRAPHQL_VALIDATION_FAILED/GRAPHQL_PARSE_FAILED. Stack, secrets, raw upstream details, cookies/tokens не публикуются. Бизнес-outcomes mutations относятся к data payload. Ошибки auth/storage возвращаются в GraphQL envelope (не полагаться только на HTTP status); transport/Origin/body violations могут иметь HTTP 4xx.

```json
{
  "errors": [{ "message": "Authentication required", "extensions": { "code": "UNAUTHENTICATED" } }]
}
```

Максимум body 256 KiB; depth 8, complexity 200. Каждый field и alias стоит единицу; fragment расширяется при каждом использовании, циклы отвергаются. Connection `items` умножает стоимость вложенных полей на pageSize (default 8). Бюджет проверяется при validation и заново с variables перед исполнением, суммарно для operations документа. HTTP batching запрещён; subscriptions не поддерживаются. В production introspection запрещена, IDE/landing page отключены во всех средах. REST маршруты и error format сохранены; общий список exposed headers дополнен только именем `X-Superadmin-CSRF`, чтобы общий CORS middleware не скрыл bootstrap header.

## Подключение SA-GQL-02 и владение

1. Owner 01 интегрирует root/common SDL и проверяет feature fragment; target SDL не импортировать в runtime. Все root/nested fields публикуются только с реализованными resolvers и tests.
2. SA-GQL-02 подключила runtime auth fragment и `imports: [SuperadminAuthModule]`, `principalVerifier: { provide: AdminPrincipalVerifier, useExisting: SessionAdminPrincipalVerifier }` в `withRuntime`. Проверен именно этот DI-binding, не override default verifier в auth integration tests. `superadminSession` обеспечивает реальный Query root и остаётся под общей защитой. Защита обычных пользователей не заменяется административной.
3. `setupSuperadminHttp` уже установлен в bootstrap до общего parser/CORS; сохранять этот порядок и exact path. GraphQL config использует `/graphql` + `useGlobalPrefix: true`, итог — `/api/v1/graphql`, без двойного prefix.
4. Feature owners передают изменения planned/implemented sections document integrator SA-GQL-01. Владение User — карточка 3, block — 4, delete — 5, Payments — 6, social research — 7, social implementation — 8; окончательный verifier — карточка 9.

Открытые решения: public profile route (Frontend/Product); social source/columns (Architecture/Product); public data и active paid auto-renew после delete (Product + Post/File/Payment); назначение fixed credentials вне учебной проверки и rotation owner (Product/Security). Техническая сверка SA-GQL-01 их не закрывает. Документ не содержит реальных credentials, user data или tokens.

## Совместимость и технический review

Проверены Node 22.13.1 (Docker Node 22), PNPM 10.13.1, Nest 11.1.19, Express 5.2.1. Новые fixed deps: `@nestjs/graphql`/`@nestjs/apollo` 13.4.5 (peers Nest ^11.0.1), `@apollo/server` 5.5.1 (Node >=20, graphql ^16.11), `@as-integrations/express5` 1.1.2 (Express ^5), `graphql` 16.14.2. Express 5.2.1 объявлен напрямую для HTTP primitives (уже используется platform adapter). Apollo client не нужен.

Источники review: [Nest GraphQL quick start](https://docs.nestjs.com/graphql/quick-start), [field enhancers](https://docs.nestjs.com/graphql/other-features), [Apollo Express middleware](https://www.apollographql.com/docs/apollo-server/api/express-middleware), peerDependencies из npm registry выбранных версий. `@nestjs/apollo` транзитивно тянет deprecated Playground plugin с peer Apollo 4, но `playground:false` и explicit disabled landing page исключают его использование; существующие RabbitMQ/Prisma peer warnings не устраняются сторонним обновлением.

Фактические install-команды Dockerfiles проверены в изолированных временных каталогах: `pnpm install --frozen-lockfile` и Gateway-команда `npm install --no-audit --no-fund --legacy-peer-deps` завершились с exit 0. Playground warning их не заблокировал; manifest/lockfile и строгие настройки рабочего дерева не менялись. Это локальное воспроизведение команд, не полный запуск Jenkins/Linux deployment с неизвестными внешними настройками; подробные ограничения записаны в `SA_GQL_01_REVIEW.md`.

Проверка в ветке SA-GQL-01: Gateway build прошёл; 20 тестов в трёх наборах (`superadmin-infrastructure`, `jwt-token-type`, `payment-history-extension`) прошли без подключения к внешним сервисам. Инфраструктурная schema проверяет fail-closed DI, root/nested guard, безопасные ошибки с настоящим app setup, DTO bounds, HTTP/CORS/CSRF, body/depth/complexity, aliases/fragments/default variables, batching, disabled runtime и REST response regression. Это не тестирование будущих sessions, бизнес-операций или production окружения.

Точечный review добавил два теста: отказ реального Nest Apollo startup с mutation-only schema и HTTP 403 при пустом origin allow-list. Обновлённый инфраструктурный набор: 16/16; исходная REST-проверка ошибок уже проверяла status 400 и точный envelope `code/message/extensions`. Остальные ранее прошедшие наборы в этом проходе повторно не запускались.

Историческая проверка дополнения 1.1.0 в SA-GQL-01: полный SDL через `buildSchema`/`assertValidSchema`, тип `SuperadminSessionPayload` и пример query через `validate`; две проверки target contract и disabled runtime. На том этапе endpoint был отключён; это не текущий статус SA-GQL-02.

## Приёмочные проверки SA-GQL-03

`apps/main-gateway-service/test/superadmin/superadmin-users.integration-spec.ts`: 15 HTTP/DB проверок на отдельном disposable PostgreSQL 16 через production resolvers, queries и repository; замены — только конфигурация и управляемые часы. Проверены поиск/спецсимволы, четыре сортировки, pagination, nullable Profile, реальные состояния, UUID, admin guard, безопасные DB failures и точный набор runtime полей. SQL spy только наблюдает реальные обращения: одна joined выборка на страницу при 1 и 8 пользователях, одна на detail; User/Profile/Sessions/audit при чтении не меняются. Snapshot проверен вторым Prisma connection и управляемым advisory-lock barrier через test-only view/function; production запрос не содержит test hooks. Production/shared DB и реальные аккаунты не используются.

Запуск: `pnpm exec jest --config apps/main-gateway-service/test/jest.config.ts --runInBand --runTestsByPath apps/main-gateway-service/test/superadmin/superadmin-users.integration-spec.ts`. Совместный регрессионный прогон с `admin-auth.integration-spec.ts`, `user-state-audit.integration-spec.ts`, `superadmin-infrastructure.spec.ts`, `jwt-token-type.spec.ts`, `payment-history-extension.spec.ts`: 66/66. Gateway build, source/test typecheck и scoped ESLint/Prettier проверены отдельно. Это не подтверждение неизвестного public profile route или production collation; AC ссылки остаётся открытым. Новых migrations/dependencies и изменений обычного user access enforcement нет; следующий этап маршрута — 4B.

## Приёмочные проверки SA-GQL-02 и ограничения окружения

`apps/main-gateway-service/test/superadmin/admin-auth.integration-spec.ts` поднимает **новый disposable PostgreSQL 16 Docker container** с отдельным случайным именем/локальным портом и не читает application DB URLs. Применяет весь прежний migration SQL, создаёт fixture User до новой migration `20261018120000_add_admin_sessions`, затем проверяет сохранность User и новые модели. SQL каждой migration выполняется PostgreSQL `psql --single-transaction -v ON_ERROR_STOP=1`; это проверка migration SQL на существующей схеме, не deployment в общую БД. После тестов container удаляется. Требуются Docker daemon и образ `postgres:16-alpine` (при отсутствии скачивается).

Два изолированных Nest HTTP-приложения используют **разные Prisma clients и общий настоящий PostgreSQL**, production resolver/use cases/verifier/repositories, а не mock verifier или in-memory limiter. Контролируемые часы заменяют только источник времени. Проверяются credentials, hash-only persistence, cookies, replacement/independent browser sessions, точные expiry, touch/revoke races/transaction rollback, distributed limit/forged XFF, Origin/CSRF/reload bootstrap и auth-only schema. Storage failure проверяется временной недоступностью реальных SQL tables; дополнительные fault-injection spies проверяют revoke failure и маскирование неожиданных ошибок. REST-регрессия использует реальные AuthController, LocalStrategy, login/refresh use cases, JWT и Prisma repositories; внешние MS, email и production-аккаунты не используются.

Запуск: `pnpm exec jest --config apps/main-gateway-service/test/jest.config.ts --runInBand --runTestsByPath apps/main-gateway-service/test/superadmin/admin-auth.integration-spec.ts apps/main-gateway-service/test/superadmin/superadmin-infrastructure.spec.ts apps/main-gateway-service/test/unit/jwt-token-type.spec.ts apps/main-gateway-service/test/unit/payment-history-extension.spec.ts`. Дополнительно Gateway build, production typecheck и scoped ESLint/Prettier. Точные результаты текущего прохода — в отчёте задачи; эти проверки не доказывают реальную ingress/browser topology.

До окружения/production-приёмки нужны: применение migration обычным согласованным deployment-процессом, provision admin credentials через secret store, **подтверждённые exact origins**, выбор SameSite и проверка HTTPS/cookies в фактическом браузерном размещении. Product/Security должны определить назначение fixed credentials вне учебной проверки, владельца и процедуру смены с отзывом существующих admin sessions. Автоматическая смена credentials сама по себе не отзывает существующие records; процедура массового отзыва не выдумана и не объявлена выполненной. Подтверждение ingress peer IP/доверенных proxy и operational retention также требует review; никаких новых origins или trust proxy defaults не включено. Human contract/security review и production deployment в рамках этой реализации не выполнены.
