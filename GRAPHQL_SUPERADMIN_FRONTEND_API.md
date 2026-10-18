# Superadmin GraphQL API — контракт 1.1.0

Статус: целевой контракт 1.1.0; реализованы auth subset SA-GQL-02 и каталог/основные детали SA-GQL-03 и block/unblock SA-GQL-04B, soft delete SA-GQL-05, кроме открытого AC публичной ссылки профиля (`profileUrl: null`). Версия не меняется: реализованы ранее согласованные поля. Это не production-приёмка и не согласование с человеком: review Platform/Security и Frontend остаётся открытым. Перед принятием всего контракта проверить nullable Profile/Payments, outcomes, бюджет запросов, origin allow-list и незавершённый social scope.

## URL и текущая доступность

Фактический URL: `/api/v1/graphql` на Gateway (POST JSON). **Runtime endpoint включён** через `SuperadminModule.withRuntime`; опубликованы `superadminSession`, `superadminLogin`, `superadminLogout`, `superadminUsers`, `superadminUser`, `superadminBlockUser`, `superadminUnblockUser`, `superadminDeleteUser`. Runtime composition — `libs/contracts/src/graphql/superadmin/v1/runtime-type-defs.ts`: `auth-type-defs.ts`, `users-type-defs.ts`, `moderation-type-defs.ts`; target SDL целиком не загружается. Payments и Followers/Following не опубликованы. Пустой `SUPERADMIN_ALLOWED_ORIGINS` по-прежнему запрещает все admin HTTP-запросы, включая login.

**Согласованное дополнение реализовано в SA-GQL-02:** защищённая query `superadminSession: SuperadminSessionPayload!` с `authenticated: Boolean!` читает состояние текущей admin session. Действующая session → `{ authenticated: true }`, отсутствие действующей session → `UNAUTHENTICATED`. Query не является публичным исключением и не возвращает token/cookie/hash/credentials; каталог карточки 3 для валидного Query root не требуется.

Целевой SDL: `libs/contracts/src/graphql/superadmin/v1/target.graphql`, версия `1.1.0`. Общий schema-first fragment: `common-type-defs.ts` рядом; DateTime и pagination DTO — `libs/common/src/graphql`. Target SDL валидируется тестом, runtime schema собирается отдельно из реализованных feature fragments.

**SA-GQL-04A — подготовлена только внутренняя модель:** `User.isBanned` с default false и persistent `AdminUserActionAudit` в Gateway DB. `UserAccessStateQuery` различает ACTIVE/BLOCKED/DELETED и отсутствие записи (`null`), но не выполняет авторизацию; ACTIVE не отменяет email confirmation и другие проверки. State-read/audit writer экспортирует `UserStateAuditModule`, owner — Users+Sessions/security. Writer принимает согласованные action/outcome и явный живой tx существующего transaction manager для общей транзакции User/Sessions/audit в 4B/05; подробный API — в карточке 4 плана. В 4A enforcement отсутствовал; **SA-GQL-04B теперь подключает state/session checks к login, refresh, JWT REST и WS**. Каталог/основные детали реализованы в карточке 3 с использованием фактического isBanned; block/unblock реализованы в 4B, soft delete реализован в 5. Технический review и staging-проверка карточки 4 не заявлены завершёнными.

## Operations и статусы

**Реализовано — SA-GQL-02:** `superadminLogin`, `superadminLogout`, `superadminSession`. **Реализовано — SA-GQL-03:** `superadminUsers`, `superadminUser` (ссылка профиля пока null). **Реализовано — SA-GQL-04B:** `superadminBlockUser`, `superadminUnblockUser`. **Реализовано — SA-GQL-05:** `superadminDeleteUser`. Остальные операции таблицы — **Запланировано**.

| Operation                 | Input                                      | Output                                                        | Карточка                     |
| ------------------------- | ------------------------------------------ | ------------------------------------------------------------- | ---------------------------- |
| `superadminLogin`         | `SuperadminLoginInput { email, password }` | `{ authenticated: Boolean! }`, HttpOnly cookie                | **Реализовано — SA-GQL-02**  |
| `superadminLogout`        | нет                                        | `{ loggedOut: Boolean! }`                                     | **Реализовано — SA-GQL-02**  |
| `superadminSession`       | нет                                        | `SuperadminSessionPayload! { authenticated: Boolean! }`       | **Реализовано — SA-GQL-02**  |
| `superadminUsers`         | `SuperadminUsersInput!`                    | items, totalCount, pageInfo                                   | **Реализовано — SA-GQL-03**  |
| `superadminUser`          | `userId: ID!`                              | nullable SuperadminUser                                       | **Реализовано — SA-GQL-03**  |
| `superadminBlockUser`     | `{ userId: ID! }`                          | userId, BLOCKED / ALREADY_BLOCKED / NOT_FOUND / USER_DELETED  | **Реализовано — SA-GQL-04B** |
| `superadminUnblockUser`   | `{ userId: ID! }`                          | userId, UNBLOCKED / ALREADY_ACTIVE / NOT_FOUND / USER_DELETED | **Реализовано — SA-GQL-04B** |
| `superadminDeleteUser`    | `{ userId: ID! }`                          | userId, DELETED / ALREADY_DELETED / NOT_FOUND                 | **Реализовано — SA-GQL-05**  |
| `SuperadminUser.payments` | `PageInput!`                               | nullable PaymentConnection                                    | 6                            |

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

## Soft delete (реализовано — SA-GQL-05)

```graphql
mutation DeleteUser($input: SuperadminUserIdInput!) {
  superadminDeleteUser(input: $input) {
    userId
    outcome
  }
}
```

Variables: `{"input":{"userId":"00000000-0000-4000-8000-000000000001"}}` (синтетический ID). Ответ: `{"data":{"superadminDeleteUser":{"userId":"00000000-0000-4000-8000-000000000001","outcome":"DELETED"}}}`. Версия контракта остаётся **1.1.0**: реализовано ранее согласованное поле. Runtime fragment — `moderation-type-defs.ts`, без подключения полного target SDL или Payments/social.

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

| Состояние записи                 | Block outcome   | Unblock outcome |
| -------------------------------- | --------------- | --------------- |
| ACTIVE                           | BLOCKED         | ALREADY_ACTIVE  |
| BLOCKED                          | ALREADY_BLOCKED | UNBLOCKED       |
| DELETED (приоритет над isBanned) | USER_DELETED    | USER_DELETED    |
| Записи нет                       | NOT_FOUND       | NOT_FOUND       |

Некорректный UUID → `BAD_USER_INPUT`; отсутствие/expiry/revoke admin session → `UNAUTHENTICATED`; CSRF/Origin → `FORBIDDEN` (Origin проверяется на HTTP-границе); неожиданный DB failure → безопасный `INTERNAL_SERVER_ERROR`. При сбое проверки admin session сохраняется `UPSTREAM_UNAVAILABLE`. Outcomes — успешный результат выполненной команды, не исключение. Удалённый пользователь не восстанавливается. Повторные отдельные команды имеют отдельные audit results; client request deduplication не обещается.

После mutation обновить текущий каталог и открытые детали (например, Apollo `refetchQueries`), сохранив search/sort/page; no-op/NOT_FOUND/USER_DELETED также требуют актуализации UI, а не фиктивной записи user из payload. `profileUrl` всё ещё null до решения Frontend/Product; эта работа не закрывает карточку 3. **Unblock требует нового пользовательского login:** прежние sessions/access/refresh tokens не восстанавливаются. Admin sessions не отзываются. Блокировка не отменяет paid auto-renew, подписки, платежи или публичные данные; payment lifecycle здесь не меняется.

### Транзакция, каналы и пределы гарантии

`ModerateUserUseCase` через действующий transaction manager блокирует User row (`FOR UPDATE`), вычисляет outcome, при BLOCKED меняет `isBanned`, soft-revoke всех пользовательских Session (`deletedAt`) и создаёт `UserAccessRevokeOutbox`, затем пишет audit тем же живым tx. Unblock меняет только isBanned; audit записывается и для no-op/missing/deleted. Ошибка откатывает state/sessions/outbox/audit вместе. Поля audit: action, targetUserId, outcome, occurredAt, adminSessionId и id — без token/cookie/password/hash. Общая admin account не идентифицирует конкретного человека.

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

До production-приёмки остаются human security review, deployment migration, проверка RabbitMQ bindings/reconnect/scheduler и revoke на реальных Gateway pod, синхронизация часов, operational monitoring/retention, подтверждённые origins/SameSite и прежний вопрос назначения/владельца/смены fixed credentials. Точный public profile route, social contract и политики публичных данных/paid auto-renew после delete остаются открытыми и не подменяются этой реализацией.

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

Запуск: `pnpm exec jest --config apps/main-gateway-service/test/jest.config.ts --runInBand --runTestsByPath apps/main-gateway-service/test/superadmin/superadmin-users.integration-spec.ts`. Совместный регрессионный прогон с `admin-auth.integration-spec.ts`, `user-state-audit.integration-spec.ts`, `superadmin-infrastructure.spec.ts`, `jwt-token-type.spec.ts`, `payment-history-extension.spec.ts`: 66/66. Gateway build, source/test typecheck и scoped ESLint/Prettier проверены отдельно. Это не подтверждение неизвестного public profile route или production collation; AC ссылки остаётся открытым. На этапе SA-GQL-03 новых migrations/dependencies и изменений обычного user access enforcement не было; последующий результат 4B описан выше.

## Приёмочные проверки SA-GQL-02 и ограничения окружения

`apps/main-gateway-service/test/superadmin/admin-auth.integration-spec.ts` поднимает **новый disposable PostgreSQL 16 Docker container** с отдельным случайным именем/локальным портом и не читает application DB URLs. Применяет весь прежний migration SQL, создаёт fixture User до новой migration `20261018120000_add_admin_sessions`, затем проверяет сохранность User и новые модели. SQL каждой migration выполняется PostgreSQL `psql --single-transaction -v ON_ERROR_STOP=1`; это проверка migration SQL на существующей схеме, не deployment в общую БД. После тестов container удаляется. Требуются Docker daemon и образ `postgres:16-alpine` (при отсутствии скачивается).

Два изолированных Nest HTTP-приложения используют **разные Prisma clients и общий настоящий PostgreSQL**, production resolver/use cases/verifier/repositories, а не mock verifier или in-memory limiter. Контролируемые часы заменяют только источник времени. Проверяются credentials, hash-only persistence, cookies, replacement/independent browser sessions, точные expiry, touch/revoke races/transaction rollback, distributed limit/forged XFF, Origin/CSRF/reload bootstrap и auth-only schema. Storage failure проверяется временной недоступностью реальных SQL tables; дополнительные fault-injection spies проверяют revoke failure и маскирование неожиданных ошибок. REST-регрессия использует реальные AuthController, LocalStrategy, login/refresh use cases, JWT и Prisma repositories; внешние MS, email и production-аккаунты не используются.

Запуск: `pnpm exec jest --config apps/main-gateway-service/test/jest.config.ts --runInBand --runTestsByPath apps/main-gateway-service/test/superadmin/admin-auth.integration-spec.ts apps/main-gateway-service/test/superadmin/superadmin-infrastructure.spec.ts apps/main-gateway-service/test/unit/jwt-token-type.spec.ts apps/main-gateway-service/test/unit/payment-history-extension.spec.ts`. Дополнительно Gateway build, production typecheck и scoped ESLint/Prettier. Точные результаты текущего прохода — в отчёте задачи; эти проверки не доказывают реальную ingress/browser topology.

До окружения/production-приёмки нужны: применение migration обычным согласованным deployment-процессом, provision admin credentials через secret store, **подтверждённые exact origins**, выбор SameSite и проверка HTTPS/cookies в фактическом браузерном размещении. Product/Security должны определить назначение fixed credentials вне учебной проверки, владельца и процедуру смены с отзывом существующих admin sessions. Автоматическая смена credentials сама по себе не отзывает существующие records; процедура массового отзыва не выдумана и не объявлена выполненной. Подтверждение ingress peer IP/доверенных proxy и operational retention также требует review; никаких новых origins или trust proxy defaults не включено. Human contract/security review и production deployment в рамках этой реализации не выполнены.
