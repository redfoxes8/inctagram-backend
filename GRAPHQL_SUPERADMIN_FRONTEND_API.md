# Superadmin GraphQL API — контракт 1.4.0

## Быстрое подключение для frontend

- **Локальный endpoint:** `http://localhost:4278/api/v1/graphql` (POST JSON).
- **Публичный endpoint: уточняется.** Публичный HTTPS URL Gateway не подтверждён доступной конфигурацией. Итоговый URL — адрес Gateway + `/api/v1/graphql`, не frontend-путь `/superadmin`.
- Предлагаемые, **пока не подтверждённые как существующие**, страницы: `https://nymbi.org/superadmin` и `https://dev.nymbi.org:3000/superadmin`. Создание frontend в backend scope не входит.
- Учебный вход: **`admin@gmail.com` / `admin`** — теперь встроенный backend fallback, **включая production**, по явному решению пользователя от 21.10.2026. Это не обычная пользовательская учётная запись. Bcrypt-хеш фронтенду не нужен, в bundle его не передавать; пароль берётся из формы, не вшивается в приложение. Фактический публичный deployment этой версии ещё не подтверждён.
- Реальный allow-list определяется непустым `SUPERADMIN_ALLOWED_ORIGINS` **окружения запущенного Gateway** либо встроенными origins `https://nymbi.org,https://dev.nymbi.org:3000`, не загрузкой `.env.example`. `location.origin` должен совпадать точно, включая scheme и port; без `/superadmin`, wildcard и завершающего `/`. Пример `http://localhost:3000` **не считается разрешённым** без явной настройки backend. Отсутствующая/пустая/whitespace env использует fallback, а не запрещающий пустой список.
- На локальной development-БД три новые миграции применены; Gateway проверен на 4278. Это **не доказательство** настроенных admin credentials/origins, работы login или публичного deployment.
- HTTPS frontend → HTTP API может блокироваться браузером как mixed content. `SameSite=Lax` предполагает same-site размещение frontend/API; разные origins/порты не обязательно означают разные sites. Для cross-site нужны `SameSite=None; Secure`, HTTPS и browser-проверка third-party cookies. В production cookies Secure; не обещается работа произвольной комбинации адресов, включая локальный HTTP API из удалённой HTTPS страницы.

Порядок подключения:

1. Получить от backend/Operations URL Gateway и подтверждение allow-list для вашего точного origin.
2. Настроить browser transport ниже: POST JSON, `credentials: 'include'`. Cookies HttpOnly, JavaScript их не читает.
3. Выполнить login, сохранить nonce из **response header** `X-Superadmin-CSRF` в памяти.
4. После reload сначала выполнить `superadminSession` без cache; при успехе обновить nonce из header. `UNAUTHENTICATED` → форма входа; техническую ошибку не считать logout.
5. Читать каталог/детали; в mutations передавать актуальный nonce. После logout очищать client cache/состояние.

Фактическая schema для Codegen/tooling: [runtime.graphql](libs/contracts/src/graphql/superadmin/v1/runtime.graphql), версия **1.4.0**. Это экспорт реализованной composition, не доказательство версии публичного сервера. Target SDL — проектный контракт, не отдельное подтверждение deployment. Операции и примеры всех вкладок приведены ниже.

### Backend checklist до браузерного подключения

- Применены AdminSession → state/audit → revoke outbox migrations в **нужной** БД; сгенерирован совместимый Prisma Client.
- Сервер использует согласованные встроенные email/bcrypt-hash либо валидные непустые env overrides; startup Gateway сам по себе этого не проверяет как рабочий login.
- Точный frontend origin входит в разрешённые fallback origins либо env override; при смене настроек Gateway перезапущен/передеплоен. `.env.example` автоматически в deployment не загружается.
- Cookie Secure/SameSite и HTTPS соответствуют фактическому browser-размещению.
- Gateway нужной версии развёрнут; публичный URL подтверждён ответственным за окружение.
- Proxy пропускает POST/OPTIONS `/api/v1/graphql`, request `Origin`, `Content-Type`, `X-Superadmin-CSRF`, cookies и response `Set-Cookie`, `X-Superadmin-CSRF`; CORS credentials и expose header не теряются. Не логировать credentials/cookies/nonce.

Выполнение этого checklist на публичном сервере **не подтверждено**. Открыты profile route (`profileUrl=null`), реальные origins/API URL, browser HTTPS/SameSite, provision/rotation секретов, staging/two-pod и production-политики публичных данных/paid auto-renew после delete. FOLLOW-ZERO-1 принят как временные пустые connections, не настоящие социальные данные.

### Встроенные fallback и env override — решение от 21.10.2026

Пять новых env **необязательны** при использовании встроенных настроек. Это осознанное изменение прежнего запрещающего configuration default, в том числе для production; оно не ослабляет guards/сессии/CSRF/rate limit. Исторические отчёты ниже и в других файлах описывают прежнее поведение, а не наличие этих defaults с начала разработки.

| Настройка                      | Встроенный fallback                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| SUPERADMIN_EMAIL               | `admin@gmail.com`                                                                        |
| SUPERADMIN_PASSWORD_HASH       | Bcrypt-хеш учебного `admin`, cost=12; значение только в backend, фронтенду не передаётся |
| SUPERADMIN_ALLOWED_ORIGINS     | `https://nymbi.org,https://dev.nymbi.org:3000`                                           |
| SUPERADMIN_COOKIE_SAME_SITE    | `lax`                                                                                    |
| SUPERADMIN_PAYMENTS_TIMEOUT_MS | `3000`                                                                                   |

Каждое значение разрешается независимо: отсутствующее, пустое или состоящее только из пробелов → fallback; непустое → env override. Непустые значения не заменяются defaults при ошибке валидации: неверные email/hash/SameSite закрывают login (`UPSTREAM_UNAVAILABLE`), неправильный формат origins останавливает bootstrap, неверный timeout закрывает Payments read. Email по-прежнему trim/lowercase; остальные непустые значения не «исправляются» молча. Разрешение defaults не записывает значения в `process.env`.

**Пустыми env административный вход больше не отключается.** Guard по-прежнему запрещает доступ без действующей admin session, обычный user JWT не подходит. В production cookie остаётся HttpOnly/Secure/SameSite=Lax; `none` сохраняет Secure, но требует подходящего HTTPS/cross-site размещения и browser-проверки. Изменение/обновление defaults или env требует перезапуска/передеплоя Gateway. Не логировать пароль, hash, cookies, tokens.

В текущем manifest четыре admin Secret key references помечены `optional:true`, timeout отдельно не подключён и использует default. Поэтому отсутствие **этих ключей** не препятствует запуску Node.js. Другие обязательные Secret/key references и инфраструктура остаются необходимыми: если весь существующий Secret или другой обязательный key отсутствует, Kubernetes может не запустить контейнер, и fallback приложения это не исправит. Pipeline/manifest этой задачей не меняются.

Статус: runtime и целевой контракт **1.4.0**. Additive S3: существующий superadminBlockUser принимает optional reason; legacy-вызовы сохраняются. S1 ранее добавил banFilter с default ALL в версии 1.3.0. Общий Payments list ещё не опубликован. Реализованы auth SA-GQL-02, каталог/детали SA-GQL-03, block/unblock SA-GQL-04B, soft delete SA-GQL-05, Payments SA-GQL-06 и **временный FOLLOW-ZERO-1 SA-GQL-08**. История версии: переход 1.1.0 → 1.2.0 добавил followers/following и их минимальных типов; семантика временных нулей остаётся FOLLOW-ZERO-1. Настоящий social graph не реализован. Открытый AC profileUrl карточки 3 и прежние product/security/environment вопросы сохраняются; это подготовка к техническому review, не production-приёмка.

**SA-GQL-09:** совместная работа backend проверена автоматизированно; [отчёт, матрица UC/карточки/доказательства и ограничения](SA_GQL_09_ACCEPTANCE.md). Проверка агента не означает человеческое согласование API/security, проверку frontend или production-приёмку. Ниже текущий контракт; прежние приёмочные разделы в конце — история отдельных этапов.

## URL и текущая доступность

Фактический URL: `/api/v1/graphql` на Gateway (POST JSON). **Runtime endpoint включён** через `SuperadminModule.withRuntime`; опубликованы `superadminSession`, `superadminLogin`, `superadminLogout`, `superadminUsers`, `superadminUser`, `superadminBlockUser`, `superadminUnblockUser`, `superadminDeleteUser`. Runtime composition — `libs/contracts/src/graphql/superadmin/v1/runtime-type-defs.ts`: `auth-type-defs.ts`, `users-type-defs.ts`, `moderation-type-defs.ts`, `payments-type-defs.ts`, `follow-zero-type-defs.ts`; target SDL целиком не загружается. Поля `SuperadminUser.payments`, `followers`, `following` опубликованы; последние два реализуют только временные hardcoded-zero connections. Отсутствующий/пустой `SUPERADMIN_ALLOWED_ORIGINS` теперь использует два согласованных fallback origins, остальные Origin по-прежнему отклоняются.

**Согласованное дополнение реализовано в SA-GQL-02:** защищённая query `superadminSession: SuperadminSessionPayload!` с `authenticated: Boolean!` читает состояние текущей admin session. Действующая session → `{ authenticated: true }`, отсутствие действующей session → `UNAUTHENTICATED`. Query не является публичным исключением и не возвращает token/cookie/hash/credentials; каталог карточки 3 для валидного Query root не требуется.

Целевой SDL: `libs/contracts/src/graphql/superadmin/v1/target.graphql`, версия **1.4.0** (`SUPERADMIN_CONTRACT_VERSION`). Runtime собирается отдельно из реализованных feature fragments, весь target не загружается. Общие DateTime/PageInput/PageInfo и pagination validation переиспользуются.

Для frontend tooling: **[экспорт фактически опубликованного runtime SDL](libs/contracts/src/graphql/superadmin/v1/runtime.graphql)**. Это отдельный артефакт, не target и не новая версия контракта. Тест SA-GQL-09 сравнивает его канонический SDL с реальным `GraphQLSchemaHost` всех production superadmin feature modules, а все executable GraphQL-блоки этого guide проходят parse/validate по этой schema. Связный HTTP-сценарий исполняет auth/catalog/все вкладки/moderation/logout; schema validation остальных примеров не объявляется их исполнением.

**SA-GQL-04A — подготовлена только внутренняя модель:** `User.isBanned` с default false и persistent `AdminUserActionAudit` в Gateway DB. `UserAccessStateQuery` различает ACTIVE/BLOCKED/DELETED и отсутствие записи (`null`), но не выполняет авторизацию; ACTIVE не отменяет email confirmation и другие проверки. State-read/audit writer экспортирует `UserStateAuditModule`, owner — Users+Sessions/security. Writer принимает согласованные action/outcome и явный живой tx существующего transaction manager для общей транзакции User/Sessions/audit в 4B/05; подробный API — в карточке 4 плана. В 4A enforcement отсутствовал; **SA-GQL-04B теперь подключает state/session checks к login, refresh, JWT REST и WS**. Каталог/основные детали реализованы в карточке 3 с использованием фактического isBanned; block/unblock реализованы в 4B, soft delete реализован в 5. Технический review и staging-проверка карточки 4 не заявлены завершёнными.

## Operations и статусы

**Реализовано — SA-GQL-02:** `superadminLogin`, `superadminLogout`, `superadminSession`. **Реализовано — SA-GQL-03:** `superadminUsers`, `superadminUser` (ссылка профиля пока null). **Реализовано — SA-GQL-04B:** `superadminBlockUser`, `superadminUnblockUser`. **Реализовано — SA-GQL-05:** `superadminDeleteUser`. **Реализовано — SA-GQL-06:** `SuperadminUser.payments`. **Реализовано — SA-GQL-08:** Followers/Following как временный hardcoded-zero API.

| Operation                  | Input                                       | Output                                                                | Карточка                                             |
| -------------------------- | ------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------- |
| `superadminLogin`          | `SuperadminLoginInput { email, password }`  | `{ authenticated: Boolean! }`, HttpOnly cookie                        | **Реализовано — SA-GQL-02**                          |
| `superadminLogout`         | нет                                         | `{ loggedOut: Boolean! }`                                             | **Реализовано — SA-GQL-02**                          |
| `superadminSession`        | нет                                         | `SuperadminSessionPayload! { authenticated: Boolean! }`               | **Реализовано — SA-GQL-02**                          |
| `superadminUsers`          | `SuperadminUsersInput!`                     | items, totalCount, pageInfo                                           | **Реализовано — SA-GQL-03**                          |
| `superadminUser`           | `userId: ID!`                               | nullable SuperadminUser                                               | **Реализовано — SA-GQL-03**                          |
| `superadminBlockUser`      | `input: { userId: ID! }`, optional `reason` | userId, BLOCKED / ALREADY_BLOCKED / NOT_FOUND / USER_DELETED          | **Реализовано — SA-GQL-04B + S3 reason**             |
| `superadminUnblockUser`    | `{ userId: ID! }`                           | userId, UNBLOCKED / ALREADY_ACTIVE / NOT_FOUND / USER_DELETED         | **Реализовано — SA-GQL-04B**                         |
| `superadminDeleteUser`     | `{ userId: ID! }`                           | userId, DELETED / ALREADY_DELETED / NOT_FOUND                         | **Реализовано — SA-GQL-05**                          |
| `SuperadminUser.payments`  | `PageInput!`                                | nullable PaymentConnection                                            | **Реализовано — SA-GQL-06**                          |
| `SuperadminUser.followers` | `PageInput!`                                | nullable SuperadminFollowConnection, только items=[]/нулевые metadata | **Реализовано — временный FOLLOW-ZERO-1, SA-GQL-08** |
| `SuperadminUser.following` | `PageInput!`                                | nullable SuperadminFollowConnection, только items=[]/нулевые metadata | **Реализовано — временный FOLLOW-ZERO-1, SA-GQL-08** |

Followers/Following **реализованы как временный FOLLOW-ZERO-1** по решению пользователя от 19.10.2026; [ADR](docs/adr/SA_FOLLOW_DISCOVERY.md) сохраняет доказательства отсутствия пригодного source и отложенные предложения о настоящих связях. Оба поля всегда возвращают пустые items и нулевые metadata с page/pageSize из валидированного input. Это не чтение реальных отношений; публичные нулевые counters не изменены. FOLLOW-PREP-01/02 остаются отложенными. Приёмка карточки 9 начинается после технической приёмки/merge 8; только здесь разрешены постоянные нулевые ответы, не маскирующие ошибки Payments/других данных.

Реализованная операция (**SA-GQL-02**):

```graphql
query CurrentSuperadminSession {
  superadminSession {
    authenticated
  }
}
```

При действующей session: `{"data":{"superadminSession":{"authenticated":true}}}`. Без действующей session: `{"data":null,"errors":[{"message":"Authentication required","path":["superadminSession"],"extensions":{"code":"UNAUTHENTICATED"}}]}`. Frontend использует query для проверки текущей admin session: `UNAUTHENTICATED` означает необходимость входа. Сетевой сбой, timeout, `UPSTREAM_UNAVAILABLE` и другие технические ошибки не следует автоматически трактовать как отсутствие session. Auth flow проверяется автоматизированно с изолированной PostgreSQL; неизвестное реальное browser deployment этими проверками не подтверждается.

## Followers/Following — реализован временный FOLLOW-ZERO-1 (SA-GQL-08)

Это **реализованный временный контракт FOLLOW-ZERO-1**, опубликованный в текущих runtime и target **1.4.0** (добавлен в 1.2.0) отдельным `follow-zero-type-defs.ts`. Минимальный `SuperadminFollowZeroResolver` вызывает общую чистую application-функцию `getTemporaryFollowZero`; нет repository, social DB, клиентов/RPC, DataLoader или feature flags. Старый candidate 0.1 с followedAt/profile/privacy в ADR остаётся отложенным и не применяется к текущему API.

```graphql
extend type SuperadminUser {
  followers(input: PageInput!): SuperadminFollowConnection
  following(input: PageInput!): SuperadminFollowConnection
}
type SuperadminFollowConnection {
  items: [SuperadminFollowItem!]!
  totalCount: Int!
  pageInfo: PageInfo!
}
type SuperadminFollowItem {
  userId: ID!
}
```

Общие PageInput/PageInfo уже существуют: `input:{}` → page=1/pageSize=8; page 1..10000, pageSize 1..50. Item object имеет лишь минимальный структурный ID (GraphQL требует непустой object type); он **никогда не создаётся** на этом этапе, а userId не означает утверждение колонки UI. Нет username/profileUrl/followedAt, поиска/сортировок/privacy-функций и дополнительных counters в этих connections. Будущий настоящий item-контракт потребует отдельного решения.

Фактическое поведение, одинаковое для followers и following:

- Любой валидный input возвращает items=[], totalCount=0, pagesCount=0, hasNextPage=false; page/pageSize берутся из валидированного input/defaults. Например, page=10000/pageSize=50 возвращает нули и именно page=10000/pageSize=50. Это намеренные hardcoded значения, а не результат чтения source и не доказательство отсутствия внешних реальных связей.
- Невалидные page/pageSize, required-null или неверный тип → BAD_USER_INPUT, не успешный нулевой результат. Общие body/depth/complexity budgets сохраняются независимо от пустых списков.
- Root и nested fields требуют действующую admin session; user JWT/expired/revoked session не дают доступ, aliases/fragments не обходят guard. Требуются действующие Origin/CORS-проверки; query не требует mutation-only CSRF.
- Отсутствующий/soft-deleted parent остаётся null, nested resolver не запускается. Без Profile не создаётся Profile; остальные правила superadminUser не меняются.
- Нет social DB, RPC или внешнего сервиса. Существующие auth/session/parent DB reads и auth touch сохраняются. Ошибки admin/validation и неожиданные ошибки не скрываются за константным успешным ответом.
- Connections nullable для field errors; unexpected failure → безопасный INTERNAL_SERVER_ERROR с path/alias, без внутренних данных. Внутри успешной connection items/metadata non-null.

Реализованный запрос с обеими вкладками:

```graphql
query SocialTabs($userId: ID!, $input: PageInput!) {
  superadminUser(userId: $userId) {
    followers(input: $input) {
      items {
        userId
      }
      totalCount
      pageInfo {
        page
        pageSize
        pagesCount
        hasNextPage
      }
    }
    following(input: $input) {
      items {
        userId
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
}
```

Variables: `{"userId":"00000000-0000-4000-8000-000000000001","input":{"page":2,"pageSize":8}}` — синтетический ID для примера, заменить UUID выбранного fixture. Defaults: `"input":{}`. Результат каждой connection, без вымышленных строк:

```json
{
  "items": [],
  "totalCount": 0,
  "pageInfo": { "page": 2, "pageSize": 8, "pagesCount": 0, "hasNextPage": false }
}
```

### Aliases: независимые страницы

```graphql
query SocialPages($userId: ID!) {
  superadminUser(userId: $userId) {
    incoming: followers(input: { page: 1, pageSize: 8 }) {
      items {
        userId
      }
      totalCount
      pageInfo {
        page
        pageSize
        pagesCount
        hasNextPage
      }
    }
    outgoing: following(input: { page: 10000, pageSize: 50 }) {
      items {
        userId
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
}
```

Variables: `{"userId":"00000000-0000-4000-8000-000000000001"}` (синтетический пример). Для существующего parent результат:

```json
{
  "data": {
    "superadminUser": {
      "incoming": {
        "items": [],
        "totalCount": 0,
        "pageInfo": { "page": 1, "pageSize": 8, "pagesCount": 0, "hasNextPage": false }
      },
      "outgoing": {
        "items": [],
        "totalCount": 0,
        "pageInfo": { "page": 10000, "pageSize": 50, "pagesCount": 0, "hasNextPage": false }
      }
    }
  }
}
```

Aliases одного направления тоже независимы; request cache отсутствует. Приложение не предписывает текст UI: техническое ограничение описано здесь, а выбор текста остаётся frontend.

В UI нули разрешены как явно временное ограничение. Настоящие directed relationships, хранение/активность/колонки/privacy/follow-unfollow и FOLLOW-PREP-01/02 **отложены**, не блокируют текущие 8/9 и не считаются реализованными. Публичный profileUrl карточки 3, реальные admin origins, staging/two-pod и production-политики delete/active paid auto-renew по-прежнему открыты. Решение пользователя не означает отдельного Architecture/Security/Frontend sign-off.

## Типы и nullable-поля

`DateTime` — ISO-8601 UTC (`YYYY-MM-DDTHH:mm:ss[.SSS]Z`), сериализуется с миллисекундами. `superadminUser` проверяет строковый UUID через принятую в проекте `@IsUUID()`; некорректный ID → `BAD_USER_INPUT`. `SuperadminUserState`: ACTIVE/BLOCKED, по фактическому сохранённому `User.isBanned`; email confirmation — отдельный фактический `isEmailConfirmed`. ACTIVE не отменяет существующие проверки входа.

List/detail: `userId`, `createdAt`, `state`, `isEmailConfirmed` non-null. `username`, `profileUrl`, `avatarUrl` nullable: Profile optional в текущей Prisma model. Detail без Profile возвращает null этих полей. Отсутствующий/deleted User — null detail. Public profile route не подтверждён, URL не выдумывать; дата создания берётся из User.

Payments: реализованный `GetPaymentHistory(user_id,page,page_size)` adapter предоставляет transactionId, createdAt, paidAt, amountMinor (целые minor currency units), currency, productId/productName, billingInterval/Count, provider, kind, status, checkoutPurpose, subscriptionId/EndsAt. Optional paidAt/checkoutPurpose/subscriptionId/subscriptionEndsAt остаются nullable. При timeout/outage сохраняются основные данные пользователя: `payments: null` + error `UPSTREAM_UNAVAILABLE`, не ложный пустой список. Выбор отображаемых UI-колонок остаётся вопросом Product; поля Payments без изменений сохраняются в API-контракте 1.4.0, Stripe lifecycle не меняется.

## Pagination, search, sort и banFilter (SA-GQL-03 + S1)

`page` 1..10 000, default 1; `pageSize` 1..50, default 8. `PageInfo`: page, pageSize, pagesCount, hasNextPage; `totalCount` относится к фильтру. Успешная страница вне диапазона данных — пустые items с корректной metadata. Невалидные bounds — BAD_USER_INPUT. DTO `PaginationInput` должен применяться к `@Args('input')` каждой реализованной feature; декларация SDL сама не проверяет диапазоны.

**S1 — фильтр блокировки (1.3.0):** `SuperadminUsersInput.banFilter: SuperadminUsersBanFilter! = ALL`.

| UI           | banFilter   | Поведение                    |
| ------------ | ----------- | ---------------------------- |
| Not selected | ALL         | Все неудалённые пользователи |
| Blocked      | BLOCKED     | isBanned=true                |
| Not blocked  | NOT_BLOCKED | isBanned=false               |

Фильтр применяется в БД вместе с поиском **до count и pagination**; items/totalCount остаются на одном SQL snapshot. Подтверждение email не влияет на фильтр, отсутствие Profile не исключает пользователя. Во всех вариантах deletedAt IS NULL. Без banFilter (включая `input:{}`) действует ALL, defaults page=1/pageSize=8 и прежний response не меняются. Неподдерживаемое значение enum/явный null → безопасный BAD_USER_INPUT до чтения каталога; для Not selected отправляйте ALL или не передавайте поле, не null. Поиск/4 сортировки сочетаются с фильтром, `totalCount` относится ко всей отфильтрованной выборке.

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

Variables (filter + search + pagination): `{"input":{"page":1,"pageSize":8,"searchUsername":"  sample  ","sort":"USERNAME_ASC","banFilter":"BLOCKED"}}`. Для всех пользователей: `"banFilter":"ALL"` или прежний `{"input":{}}`; для незаблокированных: `"banFilter":"NOT_BLOCKED"`. Размер/номер страницы и сортировка работают как раньше.

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

## Payments (реализовано — SA-GQL-06)

`SuperadminUser.payments(input: PageInput!): PaymentConnection` — nullable field resolver. Источник — существующий внутренний `GetPaymentHistory`; user_id берётся **только из родительского SuperadminUser**, отдельного target ID в аргументах поля нет. Public REST history не используется, Gateway не читает Payment DB напрямую. Admin guard повторно применяется к вложенному resolver; обычный user JWT не подходит. Требуются действующая admin cookie (`credentials: include`) и разрешённый Origin; query не требует mutation-only CSRF header. Admin cookie/token в gRPC не передаются.

```graphql
query UserPayments($userId: ID!, $input: PageInput!) {
  superadminUser(userId: $userId) {
    userId
    username
    payments(input: $input) {
      items {
        transactionId
        createdAt
        paidAt
        amountMinor
        currency
        productId
        productName
        billingInterval
        billingIntervalCount
        provider
        kind
        status
        checkoutPurpose
        subscriptionId
        subscriptionEndsAt
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
}
```

Variables (синтетический ID): `{"userId":"00000000-0000-4000-8000-000000000001","input":{"page":1,"pageSize":8}}`. Defaults — `"input":{}`. Диапазоны: page 1..10000, pageSize 1..50; невалидные значения → `BAD_USER_INPUT` **до RPC**. Сохраняется общий complexity budget: широкая selection при pageSize=50 может быть отклонена, хотя сам pageSize допустим. Aliases с разными input выполняют независимые вызовы, страницы/пользователи не смешиваются. Если поле не выбрано или parent отсутствует/deleted, RPC не вызывается.

Порядок сохраняется из Payment MS: `createdAt DESC, ID DESC`, без пересортировки Gateway. Метаданные берутся из RPC; `hasNextPage = page < pagesCount`. Пустая история: `items:[]`, `totalCount:0`, `pagesCount:0`, `hasNextPage:false`. Допустимая страница за пределами списка возвращает пустые items, но count/pagesCount всей истории. Gateway не обещает snapshot между отдельными запросами страниц и не меняет внутреннюю транзакционную семантику Payment repository.

`amountMinor` — целое число минимальных единиц **фактической currency**, без деления/конвертации. Proto amount/count и PostgreSQL Int совместимы с GraphQL signed Int32; mapper проверяет границы, целочисленность и конечность чисел без округления/переполнения. Timestamps проверяются по protobuf диапазону и выводятся ISO UTC с миллисекундами (меньшая точность наносекунд отбрасывается). Общий gRPC client явно декодирует timestamp int64 seconds как Number: весь допустимый диапазон protobuf Timestamp безопасен для JS integer; остальные payment-поля proto — int32. Обычный REST history сохранён и проверен через настоящий HTTP endpoint.

Enums: `PaymentProvider` STRIPE/PAYPAL; `PaymentBillingInterval` WEEK/MONTH; `PaymentKind` PURCHASE/RENEWAL; `PaymentStatus` PENDING/PROCESSING/SUCCEEDED/FAILED/REFUNDED/PARTIALLY_REFUNDED; `CheckoutPurpose` INITIAL_SUBSCRIPTION/ADDITIONAL_SUBSCRIPTION. Nullable: paidAt, checkoutPurpose, subscriptionId, subscriptionEndsAt. Отсутствие proto optional становится null; пустой subscriptionId — null, но пустая дата/неизвестный или UNSPECIFIED enum не выдаются за допустимые данные. Protobuf default для отсутствующих zero scalars/empty repeated fields не означает выдуманное бизнес-значение. Несовместимые обязательные данные/метаданные дают безопасный `INTERNAL_SERVER_ERROR` на nullable payments, а не фиктивные значения.

### Timeout и partial response

`SUPERADMIN_PAYMENTS_TIMEOUT_MS`: default **3000 ms**, допустимо 1..30000. Это технический default по существующему webhook timeout convention, не внешнее согласование SLA. Невалидная настройка закрывает только Payments read (`UPSTREAM_UNAVAILABLE`), не останавливает существующие REST routes. Вызов ограничен RxJS `timeout({first: ...})` без retries; unsubscribe вызывает `call.cancel()` через Nest unary Observable teardown. Это **не передаваемый gRPC deadline**; отмена освобождает клиентский вызов, но не обещает остановку уже выполняющегося SQL на Payment MS. Cancellation наблюдается на реальном gRPC server в тесте.

При недоступном gRPC сервере/timeout поле null, path сохраняет конкретный alias. Пример для alias `history: payments(input: $input)` (не ответ с пустой историей):

```json
{
  "data": {
    "superadminUser": {
      "userId": "00000000-0000-4000-8000-000000000001",
      "username": null,
      "history": null
    }
  },
  "errors": [
    {
      "message": "Service unavailable",
      "path": ["superadminUser", "history"],
      "extensions": { "code": "UPSTREAM_UNAVAILABLE" }
    }
  ]
}
```

Ошибки admin access остаются `UNAUTHENTICATED`/`FORBIDDEN`, validation — `BAD_USER_INPUT`; они не переводятся в upstream outage. Неожиданные ошибки/повреждённые обязательные данные — `INTERNAL_SERVER_ERROR`, без stack/адресов/сырых upstream payload. На UI технический сбой не трактовать как отсутствие истории или session.

### Проверки и границы SA-GQL-06

`superadmin-payments.integration-spec.ts` поднимает настоящий GraphQL HTTP, production admin verifier/queries/adapter, **Nest PaymentGrpcController → CQRS GetPaymentHistoryHandler → PaymentQueryRepository → отдельную Payment PostgreSQL DB** в disposable container. Используются все существующие Payment migration SQL, без shared URLs/provider secrets. Это интеграция реальных history-компонентов по настоящему gRPC, **не полный PaymentRootModule/Stripe lifecycle** и не fake gRPC server. Fault injection заменяет только результат handler/mapper для недоступности/повреждённых ответов и удерживает handler для timeout; отдельно проверяется реально остановленный gRPC server. Проверены также настоящий REST `/api/v1/payments/history`, его user scope/default 10/error format, и отсутствие admin-доступа с действующим user JWT.

Рабочий Gateway soft-delete use case проверен с настоящими Payment transactions/subscriptions: записи не меняются, существующий RPC продолжает читать историю, но admin parent после удаления null и вложенный Payments RPC не вызывается. Revoke relay/broker/Stripe в этом новом history-тесте не запускаются; их прежние проверки не подменяются этой проверкой. Отмена подписки/refund/auto-renew не реализуются. Public data/delete policies, profileUrl, реальные admin origins и staging/two-pod остаются открытыми; human review/production-приёмка не заявляются.

Запуск: `pnpm exec jest --config apps/main-gateway-service/test/jest.config.ts --runInBand --runTestsByPath apps/main-gateway-service/test/superadmin/superadmin-payments.integration-spec.ts apps/main-gateway-service/test/unit/superadmin-payment-history.mapper.spec.ts`. Unit mapper/config tests — отдельные тесты без БД/транспорта, не интеграционные доказательства. Итог SA-GQL-06: 27 HTTP/gRPC/DB integration + 32 unit проверки; общий регрессионный прогон **178/178 в 14 suites**, дополнительно stripe-checkout-status **2/2**. Команда регрессии: `pnpm exec jest --config apps/main-gateway-service/test/jest.config.ts --runInBand --testPathPatterns='superadmin|jwt-token-type|payment-history-extension|notifications-websocket.gateway|notification-live-event.consumer|notifications.controller|available-payment-products' --noStackTrace`. Gateway build, source/test typecheck, scoped ESLint/Prettier и git diff --check прошли. На этапе SA-GQL-06 target сохранялся 1.1.0; актуальная версия после SA-GQL-08 — **1.2.0**. Следующая карточка после технического merge — **7 SA-FOLLOW-DISCOVERY**.

## Soft delete (реализовано — SA-GQL-05)

```graphql
mutation DeleteUser($input: SuperadminUserIdInput!) {
  superadminDeleteUser(input: $input) {
    userId
    outcome
  }
}
```

Variables: `{"input":{"userId":"00000000-0000-4000-8000-000000000001"}}` (синтетический ID). Ответ: `{"data":{"superadminDeleteUser":{"userId":"00000000-0000-4000-8000-000000000001","outcome":"DELETED"}}}`. На этапе SA-GQL-05 версия сохранялась 1.1.0; актуальная версия после SA-GQL-08 — **1.2.0**. Runtime fragment этой mutation — `moderation-type-defs.ts`; полный target не загружается. Payments и FOLLOW-ZERO-1 подключены отдельными реализованными fragments.

| Состояние          | Delete outcome  |
| ------------------ | --------------- |
| ACTIVE или BLOCKED | DELETED         |
| Уже soft-deleted   | ALREADY_DELETED |
| Записи нет         | NOT_FOUND       |

Требуются действующая admin session, разрешённый Origin, JSON и `X-Superadmin-CSRF`, `credentials: 'include'`. Обычный user JWT не подходит. `adminSessionId` берётся из проверенного principal, не из input. Невалидный UUID → `BAD_USER_INPUT` до записи; отсутствующая/expired/revoked admin session → `UNAUTHENTICATED`; CSRF/Origin → `FORBIDDEN` (Origin может отклоняться на HTTP-границе). Неожиданный DB failure → безопасный `INTERNAL_SERVER_ERROR`; сбой admin verifier → `UPSTREAM_UNAVAILABLE`. ALREADY_DELETED/NOT_FOUND — business outcomes, не технический сбой.

### Транзакция и прекращение доступа

Расширен существующий `ModerateUserUseCase`, не создан отдельный delete/revoke pipeline. В одном `ITransactionManager.execute`: общий User `FOR UPDATE` (включая deleted) → deletedAt/updatedAt → прежний `revokeSessionsAndEnqueue` → audit writer с action DELETE и тем же live tx. User физически не удаляется; isBanned/isConfirmed, email/passwordHash и Profile сохраняются. Первый DELETED отзывает все пользовательские Session и создаёт одно обязательство в `UserAccessRevokeOutbox`. Повтор сохраняет первоначальный deletedAt и пишет ALREADY_DELETED audit без нового revoke event. NOT_FOUND — короткая транзакция с audit без User FK. Один audit на завершённую команду; дедупликации разных запросов нет. Сбой audit/outbox откатывает всё, сетевой publish в транзакции отсутствует.

Повторно используются enforcement, relay, exchange/routing, fan-out и consumer 4B. DELETED запрещает password/Google login, refresh, старый access token в защищённых REST, WS handshake и последующую protected delivery. AdminSession не затрагивается. Consumer работает и после физического удаления Session rows; broker outage не открывает доступ, persistent retry/duplicate handling сохраняются. Уже начатые запросы/handshake/delivery могут завершиться. Block/unblock после delete → USER_DELETED; restore нет.

Каталог исключает deleted до count/page, detail=null. Обычные User repositories продолжают скрывать deleted, административный state read различает DELETED/null. Проверено на PostgreSQL: `UserRepository.update` содержит `WHERE deletedAt IS NULL`, включая predicate recheck после конкурентного ожидания, и возвращает NotFound для stale entity; `save` выполняет INSERT (не upsert), существующий ID не восстанавливает. Исправлять эти predicates не потребовалось. Profile хранится, чтение не создаёт его; это не согласование публичной видимости. После mutation FE обновляет список/детали (Apollo refetchQueries/eviction), count/pageInfo и при необходимости уходит с опустевшей последней страницы назад. ALREADY_DELETED/NOT_FOUND также требуют обновления UI. Yes/No/крестик — frontend: mutation вызывается только после Yes. `profileUrl` карточки 3 остаётся null до подтверждения маршрута.

### Платёжная граница и production-политики

В отдельной Payment DB `PaymentTransaction`, `Subscription`, `CheckoutSession`, `ProviderCustomer` содержат userId UUID без FK на Gateway User (`apps/micro-payment-service/src/core/prisma/schema.prisma`); soft UPDATE не вызывает cross-database cascade. Handler `UserAccessRevoked` в Payment MS не найден. Новый код публикует только существующий access revoke, не cancellation/refund/auto-renew команды. Gateway `PaymentRabbitConsumer.process` читает User с deletedAt=null; его entitlement updates не пишут deletedAt, а delete этот consumer не вызывает. Интеграционно проверены сохранность Gateway entitlement inbox/cursor, User/Profile и отсутствие платёжных broker side effects. **Payment MS/Payment DB/Stripe в тесте не участвуют; сквозное чтение платёжной истории не проверено.** Soft delete не является отменой подписки или отключением auto-renew.

Открыты политики публичного профиля/постов/файлов/комментариев/уведомлений (Product + владельцы доменов) и paid auto-renew (Product/Payment). Существующие публичные read predicates не переписаны; единая политика всех публичных API не определена. Вопросы не блокируют технический merge core scope, но остаются условиями production-приёмки вместе с human review и staging/two-pod из 4B. Новых migrations/dependencies нет. Следующий этап после технического merge — карточка 6 Payments.

### Будущая ручная проверка — не выполнялась

1. В Swagger Gateway создать **нового disposable user** через **POST `/api/v1/auth/registration`** (`AuthController.registration`, `RegisterUserDto`): уникальный username 6..30, отдельный тестовый email, тестовый password 6..20 с требуемой сложностью. Не использовать существующие аккаунты и не менять БД вручную.
2. Для проверки доступа до удаления подтвердить email штатным **POST `/api/v1/auth/confirm-email?code=…`**, затем выполнить **POST `/api/v1/auth/login`**. Найти ID своего fixture в авторизованном каталоге; проверить защищённый **GET `/api/v1/sessions/my-devices`**. Confirmation code/токены не публиковать и не логировать.
3. С admin session и CSRF вызвать `superadminDeleteUser` только для ID нового fixture → DELETED. Обновить каталог/detail: записи нет, detail=null. Проверить отказ старых user access/refresh и нового login.
4. Повторить mutation → ALREADY_DELETED; первоначальный deletedAt сохраняется и новое revoke-событие не создаётся (проверено автоматизированно на БД). Не пытаться restore и не удалять другие записи.

Ручная процедура **не выполнена** и не является обязательным условием технического merge. Основная приёмка — автоматизированные вызовы рабочего delete use case/mutation на disposable PostgreSQL/RabbitMQ и двух локальных Gateway: outcomes, audit/outbox rollback, row-lock races с delete/block/unblock/password login/refresh/Google login, stale entity, каталог, REST/WS, outage/restarted relay/duplicate. Google upstream и часы — тестовые замены; это не staging и не тест Payment MS.

## Block/unblock (реализовано — SA-GQL-04B)

Обе операции — **mutations** под общей admin session/Origin/CSRF-защитой. Обычный user JWT не даёт admin-доступ. Клиент отправляет `credentials: 'include'` и `X-Superadmin-CSRF` из login/session bootstrap; `adminSessionId` для audit берётся только из проверенного principal, не из variables.

```graphql
mutation Block($input: SuperadminUserIdInput!) {
  superadminBlockUser(input: $input) {
    userId
    outcome
  }
}
mutation Unblock($input: SuperadminUserIdInput!) {
  superadminUnblockUser(input: $input) {
    userId
    outcome
  }
}
```

Variables для каждой отдельной операции: `{"input":{"userId":"00000000-0000-4000-8000-000000000001"}}`. Синтетический пример ответа: `{"data":{"superadminBlockUser":{"userId":"00000000-0000-4000-8000-000000000001","outcome":"BLOCKED"}}}`. Если обе операции отправлены в одном GraphQL document, указывать соответствующий `operationName`; они не должны запускаться неявно вместе.

### Причина блокировки — реализовано S3, контракт 1.4.0

Только block принимает дополнительный nullable аргумент `reason: SuperadminBanReasonInput`.
Input содержит `code: SuperadminBanReasonCode!` и `text: String`. Новый frontend передаёт причину;
старый пример `Block` выше без аргумента остаётся допустимым. Omitted reason или `reason: null`
создают legacy-блокировку с отсутствующей причиной; старым блокировкам причина не назначается.

| Code                  | UI label              | Text                                                            |
| --------------------- | --------------------- | --------------------------------------------------------------- |
| BAD_BEHAVIOR          | Bad behavior          | Отсутствует/null/пустой после trim → null; непустой отклоняется |
| ADVERTISING_PLACEMENT | Advertising placement | То же правило                                                   |
| ANOTHER_REASON        | Another reason        | Обязателен после trim, 1–500 Unicode code points                |

```graphql
mutation BlockWithReason($input: SuperadminUserIdInput!, $reason: SuperadminBanReasonInput) {
  superadminBlockUser(input: $input, reason: $reason) {
    userId
    outcome
  }
}
```

Стандартная причина, variables:

```json
{
  "input": { "userId": "00000000-0000-4000-8000-000000000001" },
  "reason": { "code": "BAD_BEHAVIOR" }
}
```

Another reason, variables для той же операции:

```json
{
  "input": { "userId": "00000000-0000-4000-8000-000000000001" },
  "reason": { "code": "ANOTHER_REASON", "text": "  Synthetic moderation reason  " }
}
```

Сохраняется `Synthetic moderation reason` как обычный текст, без HTML-преобразования.
Неверный enum, пропущенный code, неверный тип text или нарушение code/text дают
`BAD_USER_INPUT` до изменения данных, в том числе для повторной команды.
Например, `{"code":"BAD_BEHAVIOR","text":"not allowed"}` и
`{"code":"ANOTHER_REASON","text":"   "}` недопустимы.

Валидный повтор возвращает `ALREADY_BLOCKED`, не меняет первоначальную причину и
не повторяет revoke/outbox; audit фиксирует сохранённую причину. Unblock очищает текущую
причину, audit сохраняет её значение до очистки. NOT_FOUND/USER_DELETED не придумывают
snapshot. Причина не возвращается каталогом или деталями; read/edit API не добавлен.
Unblock/delete не принимают reason. Видимость комментариев/реакций остаётся отложенной.

| Состояние записи                 | Block outcome   | Unblock outcome |
| -------------------------------- | --------------- | --------------- |
| ACTIVE                           | BLOCKED         | ALREADY_ACTIVE  |
| BLOCKED                          | ALREADY_BLOCKED | UNBLOCKED       |
| DELETED (приоритет над isBanned) | USER_DELETED    | USER_DELETED    |
| Записи нет                       | NOT_FOUND       | NOT_FOUND       |

Некорректный UUID → `BAD_USER_INPUT`; отсутствие/expiry/revoke admin session → `UNAUTHENTICATED`; CSRF/Origin → `FORBIDDEN` (Origin проверяется на HTTP-границе); неожиданный DB failure → безопасный `INTERNAL_SERVER_ERROR`. При сбое проверки admin session сохраняется `UPSTREAM_UNAVAILABLE`. Outcomes — успешный результат выполненной команды, не исключение. Удалённый пользователь не восстанавливается. Повторные отдельные команды имеют отдельные audit results; client request deduplication не обещается.

После mutation обновить текущий каталог и открытые детали (например, Apollo `refetchQueries`), сохранив search/sort/page; no-op/NOT_FOUND/USER_DELETED также требуют актуализации UI, а не фиктивной записи user из payload. `profileUrl` всё ещё null до решения Frontend/Product; эта работа не закрывает карточку 3. **Unblock требует нового пользовательского login:** прежние sessions/access/refresh tokens не восстанавливаются. Admin sessions не отзываются. Блокировка не отменяет paid auto-renew, подписки, платежи или публичные данные; payment lifecycle здесь не меняется.

### Транзакция, каналы и пределы гарантии

`ModerateUserUseCase` через действующий transaction manager блокирует User row (`FOR UPDATE`), вычисляет outcome, при BLOCKED меняет `isBanned` и текущую причину, soft-revoke всех пользовательских Session (`deletedAt`) и создаёт `UserAccessRevokeOutbox`, затем пишет audit тем же живым tx. Unblock снимает isBanned и очищает причину; audit записывается и для no-op/missing/deleted. Ошибка откатывает reason/state/sessions/outbox/audit вместе. Поля audit: action, targetUserId, outcome, occurredAt, adminSessionId, id и optional snapshot причины (banReasonCode/banReasonText) — без token/cookie/password/hash. Общая admin account не идентифицирует конкретного человека.

| Канал                                                                 | Проверка 4B                                                                                                                                                                                                                             |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Password login                                                        | Существующие password/email-confirmation проверки + row lock/state recheck в `PrismaSessionsRepository.save` перед созданием сессии                                                                                                     |
| Google login/link/register                                            | Существующая Google email verification, внутренний state preflight (включая deleted email owners), затем тот же locked session write; preflight не заменяет атомарную проверку                                                          |
| Refresh                                                               | JWT signature/type/expiry; точные userId/deviceId и refresh iat, Session.exp в Unix seconds; state lock + conditional write/reuse revoke в одной транзакции                                                                             |
| Защищённые REST Payments/Profile/Posts/Sessions/Notifications и Users | Общие `JwtGuard`/`JwtStrategy` → `UserAccessCheck`: ACTIVE, существующая session именно пользователя/device, deletedAt=null, session.exp и token.exp ещё не истекли                                                                     |
| WS `/notifications`                                                   | Signature/type/expiry + тот же check при handshake; сервер связывает socket с userId/deviceId/Session.id/exp. Перед **каждой** защищённой доставкой проверяется каждый socket отдельно; ошибка БД запрещает delivery и закрывает socket |
| Пользовательский GraphQL                                              | Не существует в текущей базе; новый API не добавлен. Superadmin GraphQL сохраняет отдельную административную защиту                                                                                                                     |
| Внутренний user gRPC / публичные REST reads                           | Не превращаются в публичную JWT-точку; публичное чтение не менялось                                                                                                                                                                     |

ACTIVE не отменяет email confirmation и прочие существующие условия доступа. Session.exp — срок refresh-сессии в **секундах**, не access exp и не миллисекунды. Access iat не сравнивается на равенство с обновляемым refresh iat: обычный refresh не должен массово инвалидировать ещё не истёкшие access tokens. Login создаёт новый device/session, не upsert старой отозванной записи. После block→unblock старые токены по-прежнему не имеют действующей session.

После commit новые проверки запрещают защищённый доступ и последующую delivery. Уже выполняющийся запрос/handshake или начатая delivery могут завершиться: прерывание всех in-flight действий не гарантируется. Login/refresh, ожидающие User lock после block, не создают действующую сессию. Если они завершили session write до block, subsequent revoke делает даже поздно возвращённый token непригодным.

### Устойчивый revoke

Миграция `20261018140000_add_user_access_revoke_outbox` добавляет отдельную таблицу Gateway. Legacy avatar relay не подходит: он читает все PENDING как avatar events и не ждёт broker confirms; его scope не меняется. Новых dependencies/брокеров/микросервисов нет.

`UserAccessRevokeRelay` запускается существующим scheduler раз в секунду; claim одной записи — атомарный UPDATE с `FOR UPDATE SKIP LOCKED`, lease UUID на 30 секунд. Сетевая публикация выполняется **вне DB transaction** через существующий `AmqpConnection` confirm channel, timeout 5 секунд. Только подтверждение broker позволяет поставить publishedAt; сбой сохраняет `PUBLISH_FAILED`, attempts и availableAt с exponential retry 2..60 секунд. При падении worker lease истекает и другой Gateway продолжает. Lease-guarded updates не позволяют stale worker затереть результат нового. Возможны повторные публикации после crash/timeout; потребитель идемпотентен. Это at-least-once, не exactly-once. Для диагностики — безопасные structured logs с eventId/attempts/code и DB pending count/oldest createdAt/attempts; retention/мониторинг на реальном deployment требуют эксплуатационного review, автоматической очистки здесь нет.

Exchange — существующий `common_exchange` (topic); routing key `gateway.user.access.revoked.v1`, event `UserAccessRevoked`, version 1. Каждый Gateway создаёт собственную server-named exclusive/auto-delete subscriber queue (не competing-consumer общую очередь). Событие содержит только eventId/userId/occurredAt/**идентификаторы отозванных Session**, без JWT/cookies. Совпадающие локальные socket sessions отключаются безусловно; остальные sockets того же пользователя проходят state/session recheck (включая orphan после физического logout). Задержанное событие после unblock/new login сохраняет новую действующую сессию. При reconnect брокера Gateway дополнительно перепроверяет существующие sockets на случай пропущенного ephemeral fan-out; delivery в любом случае проверяет БД независимо от broker. Неисправность RabbitMQ не открывает REST/refresh/WS delivery.

### Проверки и границы окружения 4B

Совместный enforcement набор 4B/05 — 37 интеграционных проверок; отдельный fan-out prerequisite — 1. Общий scoped регрессионный набор: **112/112 в 11 наборах (SA-GQL-05)**, включая auth/catalog/4A/infrastructure, JWT, notification WS/consumer/controller и payment history. Команды воспроизведения:

```powershell
pnpm run prisma:generate
pnpm exec jest --config apps/main-gateway-service/test/jest.config.ts --runInBand --testPathPatterns='superadmin|jwt-token-type|payment-history-extension|notifications-websocket.gateway|notification-live-event.consumer|notifications.controller'
pnpm run build:main-gateway-service
pnpm exec tsc --noEmit --incremental false -p apps/main-gateway-service/tsconfig.app.json
git diff --check
```

Воспроизводимый source + изменённые test roots typecheck (PowerShell, без записи файлов):

```powershell
@'
const ts = require('typescript');
const { execFileSync } = require('node:child_process');
const raw = ts.readConfigFile('apps/main-gateway-service/tsconfig.app.json', ts.sys.readFile);
const config = ts.parseJsonConfigFileContent(raw.config, ts.sys, 'apps/main-gateway-service');
const tests = execFileSync('git', ['ls-files', '-m', '-o', '--exclude-standard'], { encoding: 'utf8' })
  .split(/\r?\n/).filter(file => file.includes('/test/') && file.endsWith('.ts'));
const program = ts.createProgram([...config.fileNames, ...tests], { ...config.options, noEmit: true, incremental: false });
const errors = ts.getPreEmitDiagnostics(program);
process.stdout.write(ts.formatDiagnosticsWithColorAndContext(errors, { getCanonicalFileName: file => file, getCurrentDirectory: ts.sys.getCurrentDirectory, getNewLine: () => '\n' }));
process.exit(errors.length ? 1 : 0);
'@ | node
```

ESLint/Prettier применяются только к затронутым TS-файлам и FE guide (не глобальный `lint --fix`). Test typecheck выполняется TypeScript API с параметрами Gateway config, `noEmit`/`incremental:false` и добавленными root-файлами затронутых тестов; это отдельная проверка от ts-jest isolated compilation. Для операционной диагностики backlog: `SELECT count(*), min("createdAt") FROM "UserAccessRevokeOutbox" WHERE "publishedAt" IS NULL`, а также attempts/availableAt/lastErrorCode; не выгружать cookies/tokens или содержимое credential configuration.

`rabbit-fanout.integration-spec.ts` воспроизводит prerequisite с двумя Nest Gateway instances и настоящим disposable RabbitMQ: независимые queues и доставка одного live event обоим. `user-access-enforcement.integration-spec.ts` использует два реальных локальных HTTP/WS приложения, отдельные Prisma clients, PostgreSQL и RabbitMQ: outcomes/audit/rollback, row-lock barriers для конкурентных команд/login/refresh/deleted fixture, real REST, WS handshake/per-session delivery, fan-out disconnect, broker pause/timeout/retry/restarted relay, lease recovery и duplicate/delayed revoke. Google provider — тестовая замена внешнего OAuth; credentials/часы — изолированные fixtures. Это **не staging и не проверка двух Kubernetes pod**. В исторических 4B сценариях deleted задаётся fixtures; сценарии SA-GQL-05 вызывают рабочий moderation use case/GraphQL mutation, не фиктивную delete-реализацию. Новая migration применяется через официальный Prisma `migrate deploy` к изолированной прежней схеме, baselined через `migrate resolve`, с проверкой сохранения User/Profile/Session/AdminSession. Shared/production DB не используются.

До production-приёмки остаются human security review, deployment migration, проверка RabbitMQ bindings/reconnect/scheduler и revoke на реальных Gateway pod, синхронизация часов, operational monitoring/retention, подтверждённые origins/SameSite и прежний вопрос назначения/владельца/смены fixed credentials. Точный public profile route и политики публичных данных/paid auto-renew после delete остаются открытыми; настоящий social contract отложен, временный FOLLOW-ZERO-1 реализуется отдельно в 8 и не подменяются этой реализацией.

## Auth, HTTP и CSRF

**Обычный user JWT не даёт admin-доступ.** Рабочий `SessionAdminPrincipalVerifier` получает только `superadminSession` из cookie; Authorization bearer и `req.user` не используются как admin principal. Binding задан внутри `SuperadminModule.withRuntime` через `useExisting` с явным импортом `SuperadminAuthModule`. Без этого binding default verifier отказывает. Все административные root/nested resolvers защищены global guard и `fieldResolverEnhancers: ['guards', 'filters']`.

Отдельная opaque admin session: 32 случайных байта (256 бит), в PostgreSQL только SHA-256 digest. Cookie `superadminSession`: HttpOnly, Secure в production, Path `/api/v1/graphql`, без Domain, Max-Age не превышает оставшийся absolute срок. Не конфликтует с обычным `refreshToken`. Idle expiry 30 минут, absolute expiry 8 часов от создания; activity update не чаще раза в минуту, idle не выходит за absolute. На точной границе expiry доступ уже запрещён. Просроченная/отозванная запись не восстанавливается; условный touch не снимает revoke. Guard может проверять nested поля повторно, но cadence проверяется в repository и не создаёт touch на каждом поле.

Повторный login транзакционно отзывает **предъявленную** прежнюю session и создаёт новую. Сессии других браузеров независимы и не отзываются login/logout текущего. Одновременные login без общего предъявленного token могут создать несколько sessions; сериализация всех конкурентных browser login не обещается. Уже начатый запрос может завершиться при конкурентном revoke; следующий запрос со старой cookie закрыт.

Login и безопасная идемпотентная очистка logout — реализованные scoped exceptions (`SuperadminSessionException`), только root Mutation с точным именем. Они не дают доступа к вложенным административным данным или другим mutations. Logout без действующей/с expired/revoked session возвращает `{ loggedOut: true }` и очищает обе admin cookies. Действующий logout требует CSRF и отзывает только текущую session. Ошибка БД при проверке/отзыве не выдаётся за успешный revoke; cookies не очищаются под ложным успешным ответом.

HTTP primitives: POST + application/json; OPTIONS только для CORS preflight, не исполнения GraphQL. `SUPERADMIN_ALLOWED_ORIGINS` — comma-separated exact HTTP(S) origins без path/wildcard, либо два fallback origins при отсутствующей/пустой env. Фактический frontend origin должен совпадать с разрешённым; неизвестный или отсутствующий Origin запрещён. Credentials=true, preflight допускает Content-Type и X-Superadmin-CSRF. Разные origins не означают разные sites; адрес API и browser compatibility требуют отдельной проверки.

First login: Origin allow-list + JSON-only, без предварительной session/nonce. Успешные login и защищённый `superadminSession` устанавливают отдельный случайный nonce в HttpOnly cookie `superadminCsrf` (тот же Path/SameSite/Secure; CSRF cookie непостоянная, без Max-Age) и возвращают его в **response header `X-Superadmin-CSRF`**, открытом через `Access-Control-Expose-Headers`. Nonce не содержит session token; FE не читает cookie другого hostname и не ослабляет HttpOnly. Хранить nonce в памяти; после reload выполнить `superadminSession` с credentials и прочитать новый header. Это работает для разных origins при разрешённых cookies; при ротации nonce другой вкладкой повторить bootstrap query перед mutation. Запросы не кешируются (`Cache-Control: no-store`).

Для mutation с действующей session FE отправляет **request header `X-Superadmin-CSRF`**, совпадающий с `superadminCsrf` cookie (timing-safe compare), вместе с browser cookies. В том числе для logout. При отсутствии действующей session logout не требует nonce, но требует разрешённый Origin и JSON. CORS сам по себе не заменяет эти проверки. Preflight допускает Content-Type и X-Superadmin-CSRF. Новую nonce из ответа session query надо сохранить до следующей mutation; игнорировать обновлённую cookie/header пару нельзя.

### Конфигурация и rate limit

Имена в `apps/main-gateway-service/.env.example` и optional secret refs в существующем `deployment.yaml`: `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD_HASH` (bcrypt cost 10..15, как существующее bcrypt средство проекта; plaintext пароль не хранится), `SUPERADMIN_ALLOWED_ORIGINS`, `SUPERADMIN_COOKIE_SAME_SITE`. Email — trim/lowercase; пароль сравнивается без trim, не более 72 UTF-8 bytes (лимит bcrypt). Неверные email/password дают одинаковую ошибку `UNAUTHENTICATED`. Некорректные/отсутствующие admin credentials закрывают login с `UPSTREAM_UNAVAILABLE`, не останавливая обычный REST startup. Обычный user login/refresh не менялся.

`SUPERADMIN_COOKIE_SAME_SITE=lax` — встроенный fallback для отсутствующей/пустой env, для same-site размещения, включая допустимые разные origins; `none` — явный cross-site override, автоматически Secure даже вне production и требует HTTPS. Другие непустые значения отключают admin login. Выбор определяется фактическим размещением; cross-site browser compatibility пока **не подтверждена**. Fallback origins точные, не wildcard; пустое значение env больше не создаёт запрещающий пустой policy.

Login ограничен **5 попытками за скользящие 15 минут на комбинацию прямого peer IP и нормализованного email**, включая неверные credentials и успешные входы. Backend — существующий Gateway PostgreSQL, `AdminLoginRateLimit`; transaction advisory lock сериализует попытки одного ключа на всех Gateway, timestamps ограничены пятью. `X-Forwarded-For` не доверяем, unconditional trust proxy не включён; за ingress peer IP может быть общим, это консервативный лимит, не подтверждение end-user IP. Ответ при лимите — `TOO_MANY_REQUESTS`, без раскрытия ключей/счётчиков. Недоступность storage — `UPSTREAM_UNAVAILABLE`, вход закрыт. Часы Gateway должны быть синхронизированы. Истёкшие окна очищаются при следующей попытке того же ключа; индекс updatedAt позволяет операторскую очистку старых rate rows. Retention/очистка revoked sessions должна учитывать будущую audit policy, автоматическое удаление здесь не выполняется.

### Общий browser transport: fetch и Apollo

Код ниже выполняется **в браузере** (Next.js client-side), не в общем SSR singleton: нельзя смешивать cookies/cache/nonce разных посетителей. Одна transport instance на текущую browser session; не отправлять параллельно несколько login/session-bootstrap запросов, меняющих nonce. Не использовать BatchHttpLink, GET queries, subscriptions или автоматический retry mutations.

`Origin` и `Cookie` устанавливает браузер; вручную подменять их не надо. Обе admin cookies HttpOnly: nonce берётся **только из response header**, а не из cookie другого hostname. Backend выставляет `Access-Control-Expose-Headers: X-Superadmin-CSRF`; proxy должен сохранить его.

```javascript
import { getOperationAST, parse } from 'graphql';

function createSuperadminTransport(endpoint) {
  let csrfNonce;

  async function cookieFetch(uri, options) {
    const payload = JSON.parse(options.body);
    const operation = getOperationAST(parse(payload.query), payload.operationName);
    if (!operation) throw new Error('Choose one GraphQL operation');
    const first = operation.selectionSet.selections[0];
    const singleField = operation.selectionSet.selections.length === 1 && first.kind === 'Field';
    const mutation = operation.operation === 'mutation';
    const loginOnly = mutation && singleField && first.name.value === 'superadminLogin';
    const logoutOnly = mutation && singleField && first.name.value === 'superadminLogout';
    const headers = new Headers(options.headers);
    headers.set('Content-Type', 'application/json');
    headers.delete('X-Superadmin-CSRF');
    if (mutation && !loginOnly && csrfNonce) headers.set('X-Superadmin-CSRF', csrfNonce);

    const response = await fetch(uri, {
      ...options,
      method: 'POST',
      credentials: 'include',
      headers,
    });
    const nonce = response.headers.get('X-Superadmin-CSRF');
    if (nonce) csrfNonce = nonce;
    if (logoutOnly) {
      const result = await response
        .clone()
        .json()
        .catch(() => null);
      const key = first.alias?.value ?? first.name.value;
      if (result?.data?.[key]?.loggedOut === true) csrfNonce = undefined;
    }
    return response;
  }

  async function request({ query, variables = {} }) {
    const response = await cookieFetch(endpoint, {
      body: JSON.stringify({ query, variables }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.result = result;
      throw error;
    }
    if (!result) throw new Error('Expected a GraphQL JSON response');
    return result; // GraphQL errors may exist even with HTTP 200; preserve partial data.
  }

  return { request, fetch: cookieFetch };
}

function requireComplete(result) {
  if (result.errors?.length) {
    const error = new Error(
      result.errors.map((item) => item.extensions?.code ?? 'UNKNOWN').join(', '),
    );
    error.result = result; // Includes partial data; never log login variables/cookies.
    throw error;
  }
  return result.data;
}
```

Этот transport не требует nonce до login и **не запрещает logout локально при отсутствии nonce**: без действующей session сервер разрешает безопасную очистку. Если session действует, сервер требует корректный CSRF. После reload сначала session query; если logout вернул FORBIDDEN из-за утраченного nonce, восстановить его session query и повторить logout явно. При UNAUTHENTICATED logout можно отправить без nonce; при UPSTREAM_UNAVAILABLE не объявлять server-side revoke успешным. Origin/JSON checks действуют во всех случаях. Auth operations отправлять отдельно, одним root field; примеры поддерживают его alias. UI не должен автоматически повторять block/delete при неизвестном результате.

### Пошаговое подключение: fetch

Использует `createSuperadminTransport` и `requireComplete` выше. `email`/`password` приходят из формы; учебная пара указана в начале документа, в bundle значения не вшивать.

```javascript
const endpoint = 'http://localhost:4278/api/v1/graphql'; // Replace only with confirmed Gateway URL.
const transport = createSuperadminTransport(endpoint);
const operations = {
  login: `mutation SignIn($input: SuperadminLoginInput!) {
    superadminLogin(input: $input) { authenticated }
  }`,
  session: `query RestoreSession { superadminSession { authenticated } }`,
  catalog: `query Catalog($input: SuperadminUsersInput!) {
    superadminUsers(input: $input) {
      items { userId username state profileUrl }
      totalCount pageInfo { page pageSize pagesCount hasNextPage }
    }
  }`,
  block: `mutation Block($input: SuperadminUserIdInput!) {
    superadminBlockUser(input: $input) { userId outcome }
  }`,
  unblock: `mutation Unblock($input: SuperadminUserIdInput!) {
    superadminUnblockUser(input: $input) { userId outcome }
  }`,
  logout: `mutation SignOut { superadminLogout { loggedOut } }`,
};

async function signIn({ email, password }) {
  return requireComplete(
    await transport.request({
      query: operations.login,
      variables: { input: { email, password } },
    }),
  ); // { superadminLogin: { authenticated: true } }; nonce captured from response header.
}

async function restoreAfterReload() {
  return requireComplete(await transport.request({ query: operations.session }));
  // { superadminSession: { authenticated: true } }; nonce refreshed before subsequent mutations.
}

async function loadCatalog() {
  return requireComplete(
    await transport.request({
      query: operations.catalog,
      variables: { input: {} },
    }),
  ); // Default first page, 8 newest; empty DB: items=[], totalCount=0, pagesCount=0.
}

async function blockDisposableUser(userId) {
  return requireComplete(
    await transport.request({
      query: operations.block,
      variables: { input: { userId } },
    }),
  ); // superadminBlockUser: { userId, outcome: 'BLOCKED' } for an ACTIVE fixture.
}

async function unblockDisposableUser(userId) {
  return requireComplete(
    await transport.request({
      query: operations.unblock,
      variables: { input: { userId } },
    }),
  ); // superadminUnblockUser: { userId, outcome: 'UNBLOCKED' } for a BLOCKED fixture.
}

async function signOut() {
  return requireComplete(await transport.request({ query: operations.logout }));
  // { superadminLogout: { loggedOut: true } }; nonce cleared; UI/cache must also be cleared.
}
```

Последовательность вызовов: `signIn({email,password})` → `loadCatalog()`; после reload вместо login — `restoreAfterReload()` → `loadCatalog()`. `blockDisposableUser(userId)`/`unblockDisposableUser(userId)` показывают mutation с автоматически добавленным CSRF header: применять только к своему disposable fixture. Variables moderation: `{"input":{"userId":"00000000-0000-4000-8000-000000000001"}}` — синтетический UUID, заменить ID своего fixture. После mutation refetch каталога/деталей; другие outcomes перечислены ниже. Завершение — `signOut()`.

Для Payments **не отбрасывать partial data** через `requireComplete`: получить `result = await transport.request(...)`, отобразить `result.data.superadminUser` и отдельно ошибку вкладки из `result.errors` (пример ниже). Ошибка nonce/session не должна маскироваться пустыми списками.

### Минимальное подключение Apollo Client

Пример для Apollo Client 4; используется **тот же** transport выше (выберите fetch или Apollo как основной клиент, не создавайте конкурирующие nonce stores). `HttpLink.fetch` получает body и использует response header; auth query всегда идёт в сеть, а не только в cache. [Официальный HttpLink](https://www.apollographql.com/docs/react/api/link/apollo-link-http) поддерживает custom fetch и credentials.

```javascript
import { ApolloClient, HttpLink, InMemoryCache, gql } from '@apollo/client';

const client = new ApolloClient({
  link: new HttpLink({
    uri: endpoint,
    credentials: 'include',
    useGETForQueries: false,
    fetch: transport.fetch,
  }),
  cache: new InMemoryCache(),
  defaultOptions: {
    query: { fetchPolicy: 'no-cache', errorPolicy: 'all' },
    watchQuery: { fetchPolicy: 'no-cache', errorPolicy: 'all' },
    mutate: { errorPolicy: 'all' },
  },
});

// email/password supplied by the sign-in form; inspect result.error even if HTTP status is 200.
async function apolloLogin({ email, password }) {
  return client.mutate({
    mutation: gql(operations.login),
    variables: { input: { email, password } },
  });
}
async function apolloRestore() {
  return client.query({ query: gql(operations.session), fetchPolicy: 'no-cache' });
}
async function apolloLogout() {
  const result = await client.mutate({ mutation: gql(operations.logout) });
  if (!result.error && result.data?.superadminLogout?.loggedOut) await client.clearStore();
  return result;
}
```

Не выполнять обычные mutations до успешного login/restore. Login не требует предварительного nonce; logout без session не блокируется клиентом из-за его отсутствия. При logout с действующей session nonce обязателен на сервере. После успешного logout очищать UI/cache; после нового login также исключить показ данных предыдущей session. С `errorPolicy:'all'` Apollo Client 4 позволяет обработать `result.error` вместе с `result.data` (например, оставить детали при outage Payments); версия Apollo в frontend может требовать своей формы проверки ошибок. Не добавлять обычный user bearer вместо admin cookie. SSR cookie forwarding этим browser-примером не покрывается.

```graphql
mutation SuperadminLogin($input: SuperadminLoginInput!) {
  superadminLogin(input: $input) {
    authenticated
  }
}
```

```graphql
mutation SuperadminLogout {
  superadminLogout {
    loggedOut
  }
}
```

Каждый блок — отдельный документ. Login variables: `{ "input": { "email": "admin@gmail.com", "password": "<пароль из формы>" } }`; учебная пара указана в начале, подставляется пользователем после серверной настройки. Logout/session variables: `{}`. Не сохранять введённый пароль в bundle или логах.

Login success JSON: `{"data":{"superadminLogin":{"authenticated":true}}}`. Logout success: `{"data":{"superadminLogout":{"loggedOut":true}}}`. Cookies и response CSRF header не являются полями GraphQL payload. Не отправлять пароль/token в GET URL, логи, telemetry или persisted operation variables.

## Errors и бюджеты

### Диагностика подключения

Проверять **HTTP status и GraphQL envelope**, не только успешный HTTP 200. При CORS/mixed content браузер может скрыть response целиком (`Failed to fetch`): смотреть Network/Console и передавать backend URL, origin, время и operation name, но не password/cookie/nonce.

| Симптом                                                                            | Значение и действие frontend                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP 404                                                                           | Проверить адрес Gateway, `/api/v1/graphql`, POST, proxy и версию deployment. Не путать с `outcome: NOT_FOUND` или nullable detail отсутствующего пользователя.                                                                                                               |
| HTTP 403, `FORBIDDEN`, `Request rejected`, либо CORS rejection без доступного body | Middleware не принял Origin. Origin должен точно входить в окружение Gateway; проверить preflight и CORS headers proxy. Отсутствующий Origin тоже запрещён; CORS не исправляется передачей bearer.                                                                           |
| `UNAUTHENTICATED`, `Authentication required`                                       | Нет действующей admin session (либо неверные credentials в login). Для protected query показать login; проверить отправку/сохранение cookies, expiry/revoke. Обычный user JWT не подходит.                                                                                   |
| `FORBIDDEN`, `Access denied` на mutation после успешной session query              | Типичный CSRF failure: header отсутствует/устарел или cookie не передалась. Получить nonce через успешную session query; отправить актуальный header вместе с cookies. Не повторять block/delete автоматически при неизвестном результате.                                   |
| `TOO_MANY_REQUESTS`, `Too many requests`                                           | Login: 5 попыток на IP + нормализованный email за 15 минут, общий storage. Прекратить автоматические повторы; после окна попробовать снова. Не рассчитывать на несуществующий обязательный Retry-After.                                                                      |
| `UPSTREAM_UNAVAILABLE`, `Service unavailable`                                      | Технический сбой session/rate-limit storage или Payment MS/timeout. Не трактовать как logout или пустую историю. Для nullable `payments` сохранить parent и показать ошибку конкретной вкладки/path. Явно невалидная непустая admin config также закрывает login этим кодом. |
| `GRAPHQL_VALIDATION_FAILED` / `GRAPHQL_PARSE_FAILED`                               | `Invalid GraphQL operation` / `Invalid GraphQL syntax`: сверить документ с runtime SDL, имена полей, required args, типы; это не ошибка пароля.                                                                                                                              |
| `BAD_USER_INPUT`, `Invalid input`                                                  | DTO bounds, UUID, длина search и другие прикладные input validations. Неверный тип variable может отклоняться GraphQL coercion этим же кодом. Budget violations могут быть BAD_USER_INPUT либо validation error в зависимости от этапа проверки.                             |
| HTTP 405/415/413                                                                   | Нужны POST / application/json / body ≤256 KiB соответственно. Transport envelope: `Request rejected`, code BAD_USER_INPUT.                                                                                                                                                   |
| `INTERNAL_SERVER_ERROR`, `Internal server error`                                   | Неожиданная ошибка backend/несовместимый ответ upstream; не подменять успешным результатом. Передать безопасный контекст backend без секретов.                                                                                                                               |

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

Открытые решения: public profile route (Frontend/Product); настоящие social source/columns/lifecycle (Architecture/Product, отложено и не блокирует временную 8); public data и active paid auto-renew после delete (Product + Post/File/Payment); назначение fixed credentials вне учебной проверки и rotation owner (Product/Security). Техническая сверка SA-GQL-01 их не закрывает. В начале приведена только согласованная учебная пара; bcrypt-хеш, production credentials, реальные user data и tokens в guide не публикуются.

## Совместимость и технический review

Проверены Node 22.13.1 (Docker Node 22), PNPM 10.13.1, Nest 11.1.19, Express 5.2.1. Новые fixed deps: `@nestjs/graphql`/`@nestjs/apollo` 13.4.5 (peers Nest ^11.0.1), `@apollo/server` 5.5.1 (Node >=20, graphql ^16.11), `@as-integrations/express5` 1.1.2 (Express ^5), `graphql` 16.14.2. Express 5.2.1 объявлен напрямую для HTTP primitives (уже используется platform adapter). Apollo client не нужен.

Источники review: [Nest GraphQL quick start](https://docs.nestjs.com/graphql/quick-start), [field enhancers](https://docs.nestjs.com/graphql/other-features), [Apollo Express middleware](https://www.apollographql.com/docs/apollo-server/api/express-middleware), peerDependencies из npm registry выбранных версий. `@nestjs/apollo` транзитивно тянет deprecated Playground plugin с peer Apollo 4, но `playground:false` и explicit disabled landing page исключают его использование; существующие RabbitMQ/Prisma peer warnings не устраняются сторонним обновлением.

Фактические install-команды Dockerfiles проверены в изолированных временных каталогах: `pnpm install --frozen-lockfile` и Gateway-команда `npm install --no-audit --no-fund --legacy-peer-deps` завершились с exit 0. Playground warning их не заблокировал; manifest/lockfile и строгие настройки рабочего дерева не менялись. Это локальное воспроизведение команд, не полный запуск Jenkins/Linux deployment с неизвестными внешними настройками; подробные ограничения записаны в `SA_GQL_01_REVIEW.md`.

Проверка в ветке SA-GQL-01: Gateway build прошёл; 20 тестов в трёх наборах (`superadmin-infrastructure`, `jwt-token-type`, `payment-history-extension`) прошли без подключения к внешним сервисам. Инфраструктурная schema проверяет fail-closed DI, root/nested guard, безопасные ошибки с настоящим app setup, DTO bounds, HTTP/CORS/CSRF, body/depth/complexity, aliases/fragments/default variables, batching, disabled runtime и REST response regression. Это не тестирование будущих sessions, бизнес-операций или production окружения.

Точечный review добавил два теста: отказ реального Nest Apollo startup с mutation-only schema и HTTP 403 при пустом origin allow-list. Обновлённый инфраструктурный набор: 16/16; исходная REST-проверка ошибок уже проверяла status 400 и точный envelope `code/message/extensions`. Остальные ранее прошедшие наборы в этом проходе повторно не запускались.

Историческая проверка дополнения 1.1.0 в SA-GQL-01: полный SDL через `buildSchema`/`assertValidSchema`, тип `SuperadminSessionPayload` и пример query через `validate`; две проверки target contract и disabled runtime. На том этапе endpoint был отключён; это не текущий статус SA-GQL-02.

## Приёмочные проверки SA-GQL-09 и воспроизводимый SDL

Текущие результаты и точные команды — [SA_GQL_09_ACCEPTANCE.md](SA_GQL_09_ACCEPTANCE.md). PostgreSQL/RabbitMQ, два **локальных** Gateway, настоящий Payment gRPC controller/handler/repository с отдельной БД проверены автоматически; полный PaymentRootModule/Stripe, браузер и staging не поднимались. Public profile route остаётся неизвестным, `profileUrl=null`. Точные admin origins, secrets provision/rotation, HTTPS/SameSite, штатный migration deployment, staging/two-pod и политики public data/paid auto-renew после delete остаются открытыми.

Экспорт воспроизводится из runtime composition существующими TypeScript/GraphQL/Prettier средствами (PowerShell из корня, вывод в stdout; отдельный генератор не добавлен). Production introspection для этого не включается. Сверку с executable Nest schema выполняет `superadmin-payments.integration-spec.ts`:

```powershell
@'
const ts = require('typescript');
const fs = require('node:fs');
require.extensions['.ts'] = (module, path) => module._compile(ts.transpileModule(
  fs.readFileSync(path, 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } }
).outputText, path);
const { buildSchema, lexicographicSortSchema, printSchema } = require('graphql');
const { SUPERADMIN_RUNTIME_TYPE_DEFS } = require('./libs/contracts/src/graphql/superadmin/v1/runtime-type-defs.ts');
const { dateTimeScalar } = require('./libs/common/src/graphql/date-time.scalar.ts');
const schema = buildSchema(SUPERADMIN_RUNTIME_TYPE_DEFS);
schema.getType('DateTime').description = dateTimeScalar.description;
process.stdout.write(printSchema(lexicographicSortSchema(schema)) + '\n');
'@ | node | pnpm exec prettier --parser graphql
```

## Приёмочные проверки SA-GQL-08 (исторический результат до SA-GQL-09)

Набор `superadmin-users.integration-spec.ts` расширен в существующем изолированном PostgreSQL/GraphQL HTTP fixture, без новой инфраструктуры. Production admin verifier/guard/nested enhancers и parent queries настоящие; управляемые часы и test Origin/config из прежнего helper. Новые сценарии проверяют обе connections, точный target/runtime тип и версию, defaults/bounds/out-of-range, aliases/fragments/parents, missing/deleted/profileless/blocked parent, root/nested denial, Origin/CORS/budget, отсутствие изменений User/Profile/Sessions/audit/revoke outbox кроме штатного AdminSession touch. Pure application component не имеет source dependencies; наблюдается ровно один joined parent SQL, Payment RPC не вызывается. Fault injection только проверяет безопасную ошибку nullable поля; это не тест реального social source, которого не создавали.

Команда scoped-регрессии: `pnpm exec jest --config apps/main-gateway-service/test/jest.config.ts --runInBand --testPathPatterns='superadmin|jwt-token-type|payment-history-extension|notifications-websocket.gateway|notification-live-event.consumer|notifications.controller|available-payment-products|stripe-checkout-status' --noStackTrace`. Результат: остальные 14 регрессионных suites — 165/165 успешно; в catalogue suite после уточнения теста динамического pageSize budget — **41/41** (26 новых FOLLOW-ZERO-1 сценариев + 15 прежних). Общий первый запуск выявил только ошибку ожидания кода в тесте статического budget; production formatter не менялся. Финальный целевой прогон: `pnpm exec jest --config apps/main-gateway-service/test/jest.config.ts --runInBand --runTestsByPath apps/main-gateway-service/test/superadmin/superadmin-users.integration-spec.ts --noStackTrace`. Gateway build, source/test typecheck, scoped ESLint/Prettier, runtime/target schema validation и diff-check прошли. Следующий этап после технического merge — **карточка 9, приёмка согласованного объёма**, не реализация настоящих связей.

## Приёмочные проверки SA-GQL-03 (исторический результат до SA-GQL-08)

`apps/main-gateway-service/test/superadmin/superadmin-users.integration-spec.ts`: 15 HTTP/DB проверок на отдельном disposable PostgreSQL 16 через production resolvers, queries и repository; замены — только конфигурация и управляемые часы. Проверены поиск/спецсимволы, четыре сортировки, pagination, nullable Profile, реальные состояния, UUID, admin guard, безопасные DB failures и точный набор runtime полей. SQL spy только наблюдает реальные обращения: одна joined выборка на страницу при 1 и 8 пользователях, одна на detail; User/Profile/Sessions/audit при чтении не меняются. Snapshot проверен вторым Prisma connection и управляемым advisory-lock barrier через test-only view/function; production запрос не содержит test hooks. Production/shared DB и реальные аккаунты не используются.

Запуск: `pnpm exec jest --config apps/main-gateway-service/test/jest.config.ts --runInBand --runTestsByPath apps/main-gateway-service/test/superadmin/superadmin-users.integration-spec.ts`. Совместный регрессионный прогон с `admin-auth.integration-spec.ts`, `user-state-audit.integration-spec.ts`, `superadmin-infrastructure.spec.ts`, `jwt-token-type.spec.ts`, `payment-history-extension.spec.ts`: 66/66. Gateway build, source/test typecheck и scoped ESLint/Prettier проверены отдельно. Это не подтверждение неизвестного public profile route или production collation; AC ссылки остаётся открытым. На этапе SA-GQL-03 новых migrations/dependencies и изменений обычного user access enforcement не было; последующий результат 4B описан выше.

## Приёмочные проверки SA-GQL-02 и ограничения окружения

`apps/main-gateway-service/test/superadmin/admin-auth.integration-spec.ts` поднимает **новый disposable PostgreSQL 16 Docker container** с отдельным случайным именем/локальным портом и не читает application DB URLs. Применяет весь прежний migration SQL, создаёт fixture User до новой migration `20261018120000_add_admin_sessions`, затем проверяет сохранность User и новые модели. SQL каждой migration выполняется PostgreSQL `psql --single-transaction -v ON_ERROR_STOP=1`; это проверка migration SQL на существующей схеме, не deployment в общую БД. После тестов container удаляется. Требуются Docker daemon и образ `postgres:16-alpine` (при отсутствии скачивается).

Два изолированных Nest HTTP-приложения используют **разные Prisma clients и общий настоящий PostgreSQL**, production resolver/use cases/verifier/repositories, а не mock verifier или in-memory limiter. Контролируемые часы заменяют только источник времени. Проверяются credentials, hash-only persistence, cookies, replacement/independent browser sessions, точные expiry, touch/revoke races/transaction rollback, distributed limit/forged XFF, Origin/CSRF/reload bootstrap и auth-only schema. Storage failure проверяется временной недоступностью реальных SQL tables; дополнительные fault-injection spies проверяют revoke failure и маскирование неожиданных ошибок. REST-регрессия использует реальные AuthController, LocalStrategy, login/refresh use cases, JWT и Prisma repositories; внешние MS, email и production-аккаунты не используются.

Запуск: `pnpm exec jest --config apps/main-gateway-service/test/jest.config.ts --runInBand --runTestsByPath apps/main-gateway-service/test/superadmin/admin-auth.integration-spec.ts apps/main-gateway-service/test/superadmin/superadmin-infrastructure.spec.ts apps/main-gateway-service/test/unit/jwt-token-type.spec.ts apps/main-gateway-service/test/unit/payment-history-extension.spec.ts`. Дополнительно Gateway build, production typecheck и scoped ESLint/Prettier. Точные результаты текущего прохода — в отчёте задачи; эти проверки не доказывают реальную ingress/browser topology.

До окружения/production-приёмки нужны: применение migration обычным согласованным deployment-процессом, provision admin credentials через secret store, **подтверждённые exact origins**, выбор SameSite и проверка HTTPS/cookies в фактическом браузерном размещении. Product/Security должны определить назначение fixed credentials вне учебной проверки, владельца и процедуру смены с отзывом существующих admin sessions. Автоматическая смена credentials сама по себе не отзывает существующие records; процедура массового отзыва не выдумана и не объявлена выполненной. Подтверждение ingress peer IP/доверенных proxy и operational retention также требует review; никаких новых origins или trust proxy defaults не включено. Human contract/security review и production deployment в рамках этой реализации не выполнены.
