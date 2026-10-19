# SA-FOLLOW-DISCOVERY — источник Followers/Following и условия SA-GQL-08

## 1. Статус и границы исследования

**Исследовательский результат принят пользователем 19.10.2026; временный hardcoded-zero вариант согласован пользователем.** Отдельное согласование Architecture/Security/Frontend не заявляется. Предложения о настоящем источнике отложены и не Accepted.

- Дата: **19.10.2026**, Europe/Kiev.
- Ветка: `docs/sa-follow-discovery`.
- Исследованный commit: `2e0618919f8a2961597c7dcf0cea99e72187889e` — merge PR #94 SA-GQL-06; локальный `dev` указывает на тот же commit. Дерево перед исследованием чистое, создание/обновление ветки не потребовалось.
- Карточка **7** — только discovery; **8** — GraphQL-вкладки; **9** — итоговая приёмка. Маршрут `1 → 2 → 4A → 3 → 4B → 5 → 6 → 7 → 8 → 9` не изменён.
- Обязательного общего каталога/шаблона ADR в доступных инструкциях не найдено. Есть тематический [architecture-decisions-payment.md](../architecture-decisions-payment.md) с Payment ADR, не общая процедура для новых ADR. Использован заданный fallback `docs/adr/SA_FOLLOW_DISCOVERY.md`.
- БД, production, shared-сервисы, внешние репозитории и frontend deployment не исследовались. Env-файлы/секреты не читались. Сборка и тестовые наборы не запускались: меняется только документация.

**Результат исследования сохранён:** пригодного источника направленных социальных связей в проверенном коде/контрактах/миграциях **не обнаружено**. Это не утверждение об отсутствии внешнего источника или чужой незамерженной реализации. Существующие profile counters — константы, а не реальная выборка. По решению пользователя ниже отсутствие source **больше не блокирует текущую карточку 8** после завершения и merge карточки 7; создание отсутствующей подсистемы отложено.

Метки далее: **[подтверждено кодом]**, **[согласовано в доступных требованиях]**, **[решение пользователя]**, **[предложение]**, **[открытый вопрос]**. Только временное решение раздела 1.1 принято пользователем; техническая сверка не является отдельным согласованием Architecture/Security/Frontend.


### 1.1. Решение пользователя от 19.10.2026 — действует для текущего этапа

**[решение пользователя]** Исследовательский результат принят. Выбран временный **hardcoded-zero** вариант: существующие публичные `followersCount=0` и `followingCount=0` сохраняются, административные Followers/Following в карточке 8 будут возвращать только пустые connections. Модель социальных связей, пользовательские follow/unfollow и создание источника **не реализуются**. Нули не являются результатом чтения реальных связей и не доказывают их отсутствие вне репозитория. Настоящая функциональность social graph не объявляется завершённой.

Прежний запрет заглушек отменён **только для этих двух вкладок и их согласованного нулевого поведения**. Для Payments, каталога, auth и прочих данных запрет фиктивных успешных ответов, в том числе маскировки ошибки пустым списком, сохраняется. Защита доступа не ослабляется.

**Статус API после реализации SA-GQL-08:** FOLLOW-ZERO-1 опубликован отдельным feature fragment; target/runtime контракт **1.2.0**, с повышением версии 1.1.0 → 1.2.0 из-за добавления полей/типов. Ниже — точная форма временного API; настоящее чтение связей по-прежнему не реализовано.

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

`SuperadminFollowItem.userId` — минимальный структурный идентификатор item-типа (GraphQL object не может быть пустым), **не утверждённая UI-колонка и не обещание выдавать строки**. В этом этапе ни одного item не создаётся; тип не содержит username, profileUrl, followedAt, privacy/state либо иных неподтверждённых колонок. Будущий настоящий row contract потребует отдельного согласования. Connections nullable для безопасных ошибок вложенного поля; items/totalCount/pageInfo внутри успешного ответа non-null.

Для **обоих** полей:

- PageInput обязателен; `input:{}` использует page=1/pageSize=8. Общие bounds: page 1..10000, pageSize 1..50; некорректный input → BAD_USER_INPUT до выполнения временного query/use case.
- Любая допустимая страница возвращает `items:[]`, `totalCount:0`, `pagesCount:0`, `hasNextPage:false`; page/pageSize отражают нормализованные и валидированные defaults либо запрошенные значения. В частности, page=10000/pageSize=50 даёт эти же нули с page=10000/pageSize=50.
- Только действующая admin session, общий guard и field-resolver enhancers; проверка root не заменяет nested guard. Обычный user JWT, expired/revoked session не дают доступ, aliases/fragments не обходят защиту. Origin/CORS и budgets сохраняются; query не требует mutation-only CSRF.
- Missing/soft-deleted parent остаётся null по существующему superadminUser; nested resolver не исполняется. Пользователь без Profile не получает создаваемый Profile, blocked/unconfirmed parent обрабатывается по текущему контракту деталей.
- Социальная БД, внешний сервис, новый RPC/cache/DataLoader не нужны и не вызываются. Существующие чтения parent/admin session и auth touch сохраняются: запрет касается **social source**, не всех DB reads.
- Не добавляются social follow/unfollow, поиск, сортировки, followedAt, новые privacy-функции или дублирующие counters: totalCount обеих connections уже равен согласованному нулю. UI может показывать 0 подписчиков / 0 подписок как временное ограничение.
- Ошибки auth/validation не превращаются в успешный нулевой ответ. Unexpected error → безопасный INTERNAL_SERVER_ERROR с nullable field/path; parent/error formatter сохраняются. Payments outage по-прежнему даёт null + UPSTREAM_UNAVAILABLE, никогда hardcoded [].

Пример реализованного временного результата одной connection при input={page:2,pageSize:8}: `{"items":[],"totalCount":0,"pageInfo":{"page":2,"pageSize":8,"pagesCount":0,"hasNextPage":false}}`. Вымышленных строк/пользовательских ID для примера нет.

FOLLOW-PREP-01/02 и разделы 4–7 ниже — **отложенные предложения для будущего настоящего social graph**, не prerequisites текущей карточки 8. Вариант хранения, lifecycle, privacy и follow/unfollow не утверждены этим решением. Profile route карточки 3, admin origins, staging/two-pod и production-политики delete/paid auto-renew не закрываются.

## 2. Проверенные области и воспроизводимость

Начальный ограниченный поиск: структура `apps/`, `libs/`, `docs/`, AGENTS/ADR; затем `follow|follower|following|subscriber|friend|relationship|social|подписч|социальн`. Уточняющий поиск: `followerId|followeeId|followingId|subscriberId|sourceUserId|targetUserId|followUser|unfollow`, модели, SQL DDL, RPC, decorators/consumers и тесты. Совпадения broker subscriber, английского слова following и Nest README badge отделены от domain follow.

Проверены **5 исходных Prisma schema**, **22 migration.sql** во всех пяти сервисах, **5 proto-контрактов**, schema-first target/runtime fragments, общие типы/события и найденные DTO/repositories/use cases. Generated Prisma copies не считались самостоятельными источниками; generated contracts не доказывают наличие отсутствующего handler. Поиск по tests не выявил поведенческого набора создания/чтения направленной социальной связи; есть лишь проверки отсутствующих социальных GraphQL-типов.

Команды для повторения без доступа к БД (из корня):

```powershell
git branch --show-current
git status --short
git rev-parse HEAD dev
rg --files apps libs -g '*.prisma' -g '*.proto' -g '*.graphql' -g '!**/client/**'
rg --files apps -g 'migration.sql'
rg -n -i 'follow|follower|following|subscriber|friend|relationship|social|подписч|социальн' apps libs docs -g '!**/client/**' -g '!**/generated/**'
rg -n '^model |^enum |@relation|@@unique' apps -g 'schema.prisma' -g '!**/client/**'
rg -n 'CREATE TABLE|ALTER TABLE|RENAME TO' apps -g 'migration.sql'
rg -n 'RabbitSubscribe|createSubscriber|routingKey:|eventType:' apps libs -g '*.ts' -g '!**/client/**' -g '!**/generated/**'
```

### Доказательства по компонентам (исторический срез исследованного commit 2e06189)

| Область | Проверенный путь и символ | Вывод / классификация |
| --- | --- | --- |
| Состав приложений | [nest-cli.json](../../nest-cli.json) — `projects`; [AppModule](../../apps/main-gateway-service/src/app.module.ts) — imports | **[подтверждено кодом]** Gateway, Post, File, Payment, Notification; отдельного Follow app нет. Само по себе это не исключает follow внутри существующего context. |
| Users/Profile, наиболее подходящий владелец | [Gateway schema](../../apps/main-gateway-service/src/core/prisma/schema.prisma) — `User`, `Profile`; [UsersModule](../../apps/main-gateway-service/src/modules/users/users.module.ts) — handlers/repositories | **[подтверждено кодом]** User/Profile/Sessions/auth/audit/payment-entitlement/outbox, но нет пары двух участников социальной связи и её read/write use cases. User имеет UUID-generated строковый ID; Profile optional, username уникален только у существующего Profile. |
| Gateway migrations | [migrations](../../apps/main-gateway-service/src/core/prisma/migrations) — `20260704213308_reset`, два rename-profile SQL, `20261018130000_add_user_state_audit`, `20261018140000_add_user_access_revoke_outbox` и остальные DDL | **[подтверждено кодом]** Проверены все 9 SQL файлов, включая старое имя UserProfile и новые audit/revoke. Нет таблицы/индекса/полей направленной follow-пары. Audit `targetUserId` — цель модерации, не followee. |
| Счётчики | [ProfileHttpMapper](../../apps/main-gateway-service/src/modules/users/api/rest/mappers/profile.http.mapper.ts) — `toGetProfile`; [GetProfileResponseDto](../../apps/main-gateway-service/src/modules/users/api/rest/dto/get-profile.dto.ts) — `followersCount`, `followingCount` | **[подтверждено кодом]** Оба значения буквально `0`. Swagger пишет «Follow MS is not implemented yet»; это комментарий о намерении, не источник/решение строить новый MS. Нельзя вывести списки или факт отсутствия подписчиков из этих нулей. |
| Путь публичного Profile | [ProfileController](../../apps/main-gateway-service/src/modules/users/api/rest/profile.controller.ts) — `getProfile`; [GetProfileHandler](../../apps/main-gateway-service/src/modules/users/application/queries/get-profile.query.ts) — `execute`; [ProfileQueryRepository](../../apps/main-gateway-service/src/modules/users/infrastructure/profile.query-repository.ts) — `getProfileByUserId` | **[подтверждено кодом]** REST читает Profile, затем User и postsCount, после чего mapper ставит zero follow counts. Нет вызова social transport. Отдельный Profile repository сам по себе не фильтрует User state; handler дополнительно читает User. Не выводить из этого privacy правила social graph. |
| User transport | [user.proto](../../libs/contracts/src/proto/user.proto) — `UserService`; [UserGrpcController](../../apps/main-gateway-service/src/modules/users/api/grpc/user.grpc.controller.ts) | **[подтверждено кодом]** Только GetUserById и GetNotificationRecipientContext. Нет follow read/write или batch-user-enrichment RPC; одиночный lookup на каждую строку был бы N+1. |
| Post | [Post schema](../../apps/micro-post-service/prisma/schema.prisma) — `Post`, `PostImage`, `OutboxEvent`; [Post migrations](../../apps/micro-post-service/prisma/migrations); [post.proto](../../libs/contracts/src/proto/post.proto) — `PostService` | **[подтверждено кодом]** ownerId поста, изображения и post-outbox; две миграции. Нет подписок, feed audience membership или направленного user-user read-контракта. GetPostsCountByUserId считает посты, не followers. |
| File | [File schema](../../apps/micro-files-service/src/core/prisma/schema.prisma) — `File`; [File migrations](../../apps/micro-files-service/src/core/prisma/migrations); [file.proto](../../libs/contracts/src/proto/file.proto) — `FileService` | **[подтверждено кодом]** Файлы одного owner, четыре миграции. Batch file data/status не является batch social graph. |
| Notification | [Notification schema](../../apps/micro-notification-service/src/core/prisma/schema.prisma) — `NotificationType`, `Notification`, delivery/inbox/outbox; [migrations](../../apps/micro-notification-service/src/core/prisma/migrations); [notification.proto](../../libs/contracts/src/proto/inctagram/notification/v1/notification.proto) — `NotificationService` | **[подтверждено кодом]** Три миграции; семь типов платёжных уведомлений, получатель userId и optional subscriptionId. Нет отправителя/followee-пары или истории follow. Получатель события не доказывает социальную связь. |
| Payment | [Payment schema](../../apps/micro-payment-service/src/core/prisma/schema.prisma) — `Subscription`, Product, PaymentTransaction; [migrations](../../apps/micro-payment-service/src/core/prisma/migrations); [payment.proto](../../libs/contracts/src/proto/payment.proto) — GetSubscriptions/GetPaymentHistory | **[подтверждено кодом]** Четыре миграции. Subscription связывает userId с productId/provider/периодом/autoRenew, не двух пользователей; её uniqueness userId+sequence не означает follow pair. Непригодна для Followers/Following. |
| События и consumers | [events](../../libs/contracts/src/events) — IPostDeletedEvent, IAvatarDeletedEvent, PaymentSucceededV1, NotificationCreatedV1; [UserAccessRevoked](../../libs/contracts/src/user-access-revoked.ts); [FilesRabbitConsumer](../../apps/micro-files-service/src/modules/files/infrastructure/files.rabbit.consumer.ts); [NotificationLiveEventConsumer](../../apps/main-gateway-service/src/modules/notifications/infrastructure/notification-live-event.consumer.ts); [PaymentRabbitConsumer](../../apps/main-gateway-service/src/modules/users/infrastructure/payment.rabbit.consumer.ts) | **[подтверждено кодом]** Найденные доменные routing keys относятся к post/avatar, payments/notifications и access revoke. Broker subscriber queue — доставка сообщений, не подписка на пользователя. Нет пригодного social event producer/consumer/read projection. Generic JSON outbox не является доказательством модели follow. |
| Admin детали/state | [PrismaSuperadminUsersQueryRepository](../../apps/main-gateway-service/src/modules/users/infrastructure/superadmin-users.query-repository.ts) — `findUser`; [GetSuperadminUserQuery](../../apps/main-gateway-service/src/modules/users/application/queries/get-superadmin-user.query.ts); [mapper](../../apps/main-gateway-service/src/modules/users/application/queries/superadmin-user.mapper.ts) — `toSuperadminUserListItem`; [PrismaUserAccessStateQuery](../../apps/main-gateway-service/src/modules/users/infrastructure/user-access-state.query.ts) | **[подтверждено кодом]** LEFT JOIN optional Profile; deleted parent скрыт, blocked/unconfirmed допустимы. profileUrl пока всегда null. State-read отличает DELETED от отсутствия, но не является privacy policy. |
| GraphQL | [runtime composition](../../libs/contracts/src/graphql/superadmin/v1/runtime-type-defs.ts) — `SUPERADMIN_RUNTIME_TYPE_DEFS`; [target 1.1.0](../../libs/contracts/src/graphql/superadmin/v1/target.graphql) — `SuperadminUser`; [Payments fragment](../../libs/contracts/src/graphql/superadmin/v1/payments-type-defs.ts) | **[подтверждено кодом]** Runtime auth/catalog/moderation/payments. У SuperadminUser есть payments, но нет followers/following ни в target, ни в runtime. Устаревший комментарий users-type-defs.ts «Payments/social fields remain outside runtime» не учитывает уже подключённый payments fragment; проверена композиция, а не комментарий. |
| Тесты | [superadmin-payments.integration-spec.ts](../../apps/main-gateway-service/test/superadmin/superadmin-payments.integration-spec.ts) — тест `publishes Payments but no social fields...`; [superadmin-users.integration-spec.ts](../../apps/main-gateway-service/test/superadmin/superadmin-users.integration-spec.ts) — schema assertions | **[подтверждено кодом]** Есть schema/каталог проверки, не функциональность social graph. Отсутствие GraphQL-типов в тесте не было единственным доказательством отсутствия источника. В этом discovery тесты не перезапускались. |
| Требования/frontend | [план, UC-6 и карточки 7/8](../../GRAPHQL_SUPERADMIN_JIRA_PLAN.md), [FE guide](../../GRAPHQL_SUPERADMIN_FRONTEND_API.md); `docs/cards.md`, `docs/view.txt`, `docs/themes.txt`, `Tasks.md`; `GatewayConfig.frontEndUrl` | **[согласовано в доступных требованиях]** Две отдельные таблицы с pagination. **[открытый вопрос]** Точные колонки, link route, privacy/active-edge policy. Frontend исходников/утверждённого social API/Figma URL в доступном материале не найдено. FRONTEND_URL — base, не правило profile route. Исторические Payment ADR/cards не описывают реализованный social источник. |

Состав SQL по сервисам, проверенный по фактическому перечню `rg --files apps -g 'migration.sql'`: Gateway **9** + Post **2** + File **4** + Notification **3** + Payment **4** = **22**. Две rename-profile migration учитываются отдельно.

## 3. Источник, направление и ограничения вывода

**[согласовано в доступных требованиях]** Для выбранного пользователя U: Followers — X, у которых есть направленная связь X → U; Following — Y, для которых есть U → Y. Это не взаимная дружба и не платная Subscription.

**[подтверждено кодом]** В проверенных областях нет авторитетной пары, уникальности пары, команды follow/unfollow, активности/состояния follow, двух paginated reads или batch social reads. Поэтому транспорт/порядок/count/privacy реального social источника сейчас **не определены**. Из accountType, OAuthAccount, JWT session, notification recipients или payment subscription восстановить реальные связи нельзя.

**[открытый вопрос, Architecture/владелец интеграций]** Есть ли другой репозиторий/внешний source of truth? Для подтверждения нужны owner по роли, versioned schema/API, пример синтетического ответа, read/write lifecycle, pagination/count/privacy guarantees, transport/caller auth и test environment. Одного адреса сервиса/устного утверждения недостаточно. Ни наличие, ни отсутствие такого внешнего источника здесь не доказано.

## 4. Отложенные варианты настоящего источника — не принятые решения

| Вариант | Владелец и границы | Необходимые работы | Влияние / риск / относительный объём |
| --- | --- | --- | --- |
| **A. Расширить Users bounded context в Gateway** | **[предложение]** Users backend owner; связь между User IDs, отдельные domain/application/infra компоненты внутри существующего context, одна Gateway schema | Directed FollowRelation, migration, pair uniqueness/self-follow constraint, два индекса направлений, настоящий authoritative write path и read port. Локальные application queries, без нового gRPC для самого Gateway. | Наименьший известный инфраструктурный объём; средний domain scope, **не работа 8**. Users/Profile рядом, можно JOIN без N+1. Риски: неподтверждённая privacy/lifecycle, несуществующие исторические данные, write load; никакого backfill из payment/counters. |
| **B. Подключить подтверждённый внешний source** | **[предложение при наличии]** Его владелец хранит edges; Gateway — admin auth, projection/обогащение | Подтверждение контракта, caller auth, направлений/состояний, совместимого page/count, bulk профилей или batch enrichment, bounded timeout и integration fixture | Объём неизвестен до предъявления источника; при готовом API может быть меньше A. Риски: нет доказанного source, другая privacy/paging, stale projection и N+1. Прямой доступ Gateway к чужой DB исключён. |
| **C. Отдельный Follow компонент/сервис** | **[предложение, сейчас не рекомендуется]** Новый data owner, своя logical schema и lifecycle | Всё из A плюс transport, service-to-service auth, deployment/health/observability, тестовая инфраструктура, enrichment/consistency | Наибольший известный объём и ops cost. Нужны доказанные независимое масштабирование/ownership/SLO, которых discovery не установил. Само слово «Follow MS» в Swagger не обосновывает новый сервис. |

**Отложенная рекомендация исследователя для будущего настоящего social graph:** при возвращении к нему сначала проверить B у Architecture, затем рассмотреть A как минимальный путь при отсутствии подтверждённого внешнего source. Сейчас пользователь выбрал временные нули, а не A/B/C; ни один вариант не разрешён к реализации и не блокирует текущую 8.

### Эскиз источника для варианта A

Всё в этом подразделе — **[предложение]**, не существующая модель:

- `FollowRelation { id, followerUserId, followingUserId, followedAt }`, реальные User IDs, оба FK в той же Gateway DB; `UNIQUE(followerUserId,followingUserId)`, `CHECK(followerUserId != followingUserId)`. Типы FK должны совпадать с существующим `User.id` (Prisma String / SQL TEXT, UUID генерируется приложением/Prisma); не вводить несовместимый `@db.Uuid` или конверсию существующих IDs молча.
- Для минимального current-state источника активная связь — наличие строки; unfollow удаляет эту связь, re-follow создаёт новый followedAt. Варианты approval/private/pending/history не добавлять молча: Product должен подтвердить, что они не нужны, либо выбрать другой lifecycle **до** модели.
- Для обоих направлений — индексы `(followingUserId,followedAt,followerUserId)` и `(followerUserId,followedAt,followingUserId)`; финальная форма/направление проверяются запросами/планом на изолированной DB, без индекса «на всякий случай».
- Нужен настоящий контролируемый write path (follow/unfollow API либо согласованный доверенный импорт), не только seeded fixtures. Actor из проверенного user principal; владение командой, активность участников и сериализация с block/delete согласуются с Users/Security. Не разрешать конкурентной команде создать разрешённую связь после отказа state-check.
- Row lifecycle при block/delete — отдельное решение. Предлагается не менять существующие moderation commands: для admin чтения фильтровать deleted counterpart, blocked показывать со state; сами edges не очищать без принятой retention/public-data policy. Это не обещание публичного поведения или восстановления удалённого аккаунта.
- Не трогать Profile counters/публичный REST автоматически. Их замена на настоящие counters — отдельный согласованный scope, а не побочная работа 8.

## 5. Отложенный кандидат реальных вкладок для будущего review (0.1, не scope текущей 8)

**Отложен, не утверждён и не часть target/runtime SDL.** Этот прежний кандидат описывает возможные настоящие связи после отдельного будущего решения; для текущей 8 его заменяет временный FOLLOW-ZERO-1 раздела 1.1. Все имена/колонки/правила ниже остаются предложениями, включая followedAt, privacy и source-side paging.

| Аспект | Статус и конкретное предложение |
| --- | --- |
| Две вкладки | **[согласовано в доступных требованиях]** Followers/Following — раздельные таблицы для выбранного пользователя с pagination. |
| Колонки | **[открытый вопрос]** точный UI-набор не дан. **[предложение]** userId, username, profileUrl и «Дата подписки» followedAt; avatarUrl — вспомогательное отображение, state — admin-индикатор. Ни одна из этих колонок не объявляется уже согласованной. |
| IDs | **[подтверждено кодом]** User IDs — UUID-generated strings. **[предложение]** parent userId только из проверенного SuperadminUser; row userId — другой участник, не relation ID, не admin ID. Формат UUID валидировать; отдельный target ID в field args не нужен. |
| Профиль | **[подтверждено кодом]** Profile optional. **[предложение]** username/avatarUrl/profileUrl nullable, LEFT JOIN не исключает profileless User и ничего не создаёт; email/credentials/session/firstName/lastName не выдавать. |
| Profile link | **[открытый вопрос]** точный public-main-app route и его параметр — Frontend/Product, тот же AC карточки 3. **[предложение]** profileUrl=null до подтверждения, в том числе при Profile; без Profile всегда null. Это не блокирует source storage, но критерий корректной ссылки остаётся открытым. |
| Дата | **[предложение]** followedAt — время создания текущей связи, DateTime!, **не User.createdAt**. Требуется надёжное время от source. Если внешний source не знает дату — пересогласовать nullable/исключение колонки, не подставлять now/User.createdAt. |
| State/confirmation | **[подтверждено кодом]** UserAccessState различает deleted/blocked. **[предложение]** выдавать существующий SuperadminUserState ACTIVE/BLOCKED для видимого counterpart; unconfirmed не скрывать и не смешивать с block. Это view state, не право защищённого доступа. |
| Pagination | **[подтверждено кодом]** общий PageInput/PaginationInput: page default 1, 1..10000; pageSize default 8, 1..50. **[предложение]** применить и к вкладкам; их размер в исходном ТЗ отдельно не задан. Invalid bounds — BAD_USER_INPUT до source call. |
| Сортировка | **[открытый вопрос]** исходные таблицы не задают sort. **[предложение]** followedAt DESC, counterpart userId DESC; уникальная пара даёт стабильный вторичный ключ в пределах parent. Не добавлять username search/sort по аналогии с каталогом без требования. |
| Count/пустота | **[предложение]** totalCount — число активных направленных edges после одинаковой visibility-фильтрации counterpart до pagination; один видимый User на строку. Empty → items=[], count=0, pagesCount=0, hasNextPage=false. Out-of-range допустимой page → items=[], реальные count/pagesCount, hasNextPage=false. |
| Snapshot | **[предложение]** вариант A: один SQL MVCC snapshot для items/count, как каталог; variant B требует явной гарантии источника, не придумывать её в adapter. Между разными запросами страниц snapshot не гарантируется. |
| Missing/deleted parent | **[подтверждено кодом]** superadminUser=null для отсутствующего/deleted User, поэтому nested resolver не запускается. **[предложение]** сохранить это поведение; не открывать deleted parent через новые вкладки. |
| Counterpart missing/deleted/blocked | **[открытый вопрос]** Product/Security утверждают видимость и retention. **[предложение]** отсутствующего/deleted исключать до count/page, blocked/unconfirmed включать; отсутствие Profile не исключает. Orphan от внешнего source обрабатывать по согласованной reconciliation policy, не добирать страницы по одному User RPC. |
| Privacy | **[открытый вопрос]** private accounts, follow requests/approval, скрытие отношений и scope admin visibility не заданы. **[предложение]** admin-only read текущих edges, без public user endpoints и без предположения, что superadmin автоматически может обойти любую privacy. До определения этого правила UI/источник не готовы. |
| Auth и бюджет | **[подтверждено кодом]** SuperadminGuard и field enhancers защищают root/nested fields, ordinary JWT не admin, query не требует mutation-only CSRF; Origin allow-list, POST JSON, body 256 KiB, depth 8, complexity 200. **[предложение]** использовать эти механизмы без нового guard, никаких admin cookies/tokens во внешнем RPC. |
| Ошибки/nullable | **[предложение]** обе connections nullable; items и metadata внутри успешного connection non-null. Auth/validation сохраняют UNAUTHENTICATED/FORBIDDEN/BAD_USER_INPUT; повреждённый источник/неожиданная ошибка → INTERNAL_SERVER_ERROR, не []. External unavailable/timeout → null соответствующего поля + UPSTREAM_UNAVAILABLE с alias path, base user/другая вкладка сохраняются. Локальная DB error — безопасный INTERNAL_SERVER_ERROR на nullable boundary, а не «нет связей». |
| Timeout | **[предложение]** внешний read ≤3000 ms (по подходу Payments), без retries, проверить unsubscribe/cancel и не называть RxJS timeout transport deadline. Для локального read нужен отдельный bounded DB statement/transaction timeout, кандидат 3000 ms; конкретный механизм/конфигурация выбираются и тестируются владельцем source, сейчас не реализованы. SLA не согласован. |

Отложенный эскиз **настоящих** данных, только внутри ADR: не применяется к текущей 8; публикация возможна лишь после отдельного будущего review/source readiness. Временный FOLLOW-ZERO-1 определён только в разделе 1.1:

```graphql
# Кандидат 0.1, НЕ target/runtime schema и НЕ исполняемый контракт.
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
  username: String
  avatarUrl: String
  profileUrl: String
  followedAt: DateTime!
  state: SuperadminUserState!
}
```

### Внутреннее чтение, batching и N+1

**[предложение]** read-port `listFollowers({userId,page,pageSize})` / `listFollowing({userId,page,pageSize})` → items с counterpart IDs/выбранными profile-полями/followedAt/state + totalCount. Owner source определяет active/visibility filter, а Gateway проверяет admin principal и DTO; не дублировать доменные правила в resolver.

Для A — JOIN User/optional Profile и count/page одним запросом, не UserAccessState по каждой строке. Для B — подтвердить batch-enrichment/IDs и bounded batch lookup, если profile не приходит вместе с edges. Текущий UserService.GetUserById **не batch API**; его нельзя объявить готовым средством без N+1. При необходимости source/API extension — отдельная подготовительная работа, не скрытая часть 8. Внешняя projection с count до исключения deleted и post-filter в Gateway несовместима с предлагаемыми metadata: нужна source-side видимость или отдельно согласованный контракт.

Для будущих настоящих данных одиночный parent не требует универсального DataLoader/framework. Если вводится request cache, ключ включает parent userId, направление, page/pageSize и visibility policy; aliases с разными страницами и разные parents не смешивать. Не вызывать source без selection, для null parent, при auth failure/invalid input. Будущий сбой реального source нельзя маскировать empty connection. **Это отложенные требования, не запрет принятого временного FOLLOW-ZERO-1:** в текущей 8 источник намеренно не используется и согласованные нули допустимы.

## 6. Отложенные решения о настоящих связях (не блокируют текущую 8)

| ID | Нужный ответ | Ответственный по роли | Предложение / что блокируется |
| --- | --- | --- | --- |
| Q1 | Есть ли подтверждённый внешний social source? Если нет — согласовать A и data owner | Architecture + Users backend owner; владелец внешних интеграций | Запросить contract/owner/test environment, иначе A. **Блокирует только будущую source implementation, не текущую 8**, не завершение исследования репозитория. |
| Q2 | Точные колонки, дата связи, nullable-поля, page/sort/count; достаточно ли candidate 0.1? | Product + Frontend + schema integrator SA-GQL-01 | Review таблицы/SDL выше; **блокирует только будущий реальный social contract, не текущую 8**. Не является разрешением менять действующий target/runtime (1.2.0 после временной 8) без будущего принятого дополнения. |
| Q3 | Direct follow или pending/private approval, self-follow, active/unfollow/re-follow lifecycle, способ наполнения source | Product + Users/Architecture | Предлагается direct/current-edge и запрет self-follow; **блокирует модель и authoritative write path**. Discovery не уполномочен добавлять эти правила. |
| Q4 | Admin visibility для blocked/deleted/missing counterpart, privacy, хранение edges после block/delete | Product + Security + Users | Предлагаются правила раздела 5; **блокирует только будущую реальную source read policy, не текущую 8**. Не изменяет принятые access revoke/soft-delete решения; общая public-data policy остаётся отдельным production-вопросом. |
| Q5 | Public profile route/параметр | Frontend/Product | Временно null; **блокирует конкретный profileUrl AC 3 и будущих реальных строк; в текущей 8 поля profileUrl нет**, не независимые storage/read работы при допустимом nullable-контракте. Не выдумывать путь из REST `/profile/:userId`. |
| Q6 | Внешний transport/caller auth/bulk/visibility/snapshot/SLA, если выбран B | Owner source + Platform/Security | Контрактный spike вместо недоказанного reuse; **блокирует будущий external adapter/source, не текущую 8**. Для A отдельный RPC не нужен. |
| Q7 | Назначение/приёмка дополнительных задач и очередь после 7 | Architecture / backend lead + Product | Утвердить PREP ниже или внешний эквивалент; **блокирует начало дополнительных работ**, а не автоматически расширяет девять карточек. |

Не переоткрываются и не закрываются этим ADR: fixed credentials purpose/rotation, реальные admin origins, staging/two-pod revoke, публичные данные и active paid auto-renew после delete. Их владельцы/границы остаются в существующем плане; social read не отменяет платную подписку и не меняет user access enforcement.

## 7. FOLLOW-PREP-01/02 — отложенные предложения вне девяти карточек

**Обе задачи отложены решением пользователя 19.10.2026 и не блокируют текущую карточку 8.** Эти идентификаторы — локальные названия будущих предложений, не созданные/согласованные Jira-карточки. Их scope/AC/DoD ниже сохранены для будущего настоящего источника и не являются условиями временных нулевых вкладок.

### FOLLOW-PREP-01 (отложено, не блокирует 8) — согласовать источник и domain/UI read-контракт

- **Результат:** reviewed дополнение ADR с source owner/вариантом, направлением/active lifecycle, privacy/count/page/sort/nullable/колонками, точным способом записи данных; независимый profile route может оставаться null с явно открытым AC.
- **Ответственный:** Architecture owner, обязательные reviewers Product, Users, Frontend, Security и schema integrator.
- **SOW:** получить ответ Q1, выбрать A либо доказанный B; утвердить Q2–Q4 и применимые Q6, границы source task, версию принятого social дополнения. Зафиксировать sign-off/отклонённые пункты, без приписывания принятому временному варианту согласования настоящего source.
- **Out of scope:** рабочий код/schema/migration/resolvers, новый сервис, реализация публичной social UI или mutation без принятого scope.
- **Зависимости:** при будущей активации нужны отдельные ответы владельцев настоящего источника; принятие исследования пользователем не утверждает эти будущие решения. **Место:** будущая очередь перед source implementation, не перед текущей 8. Сейчас задача отложена, её реализация не разрешена.
- **AC:** каждый Q1–Q4 имеет ответ/owner; IDs/direction/uniqueness/lifecycle и visibility однозначны; предлагаемый payload сопоставлен с реальным/планируемым source; profileUrl-null не скрывает открытый критерий; нет подмены Following платными подписками.
- **DoD:** письменный review и accepted/rejected решения с датой; handoff исходного и GraphQL contracts владельцам, updated guide/план через document integrator. Без sign-off результат задачи не принят.
- **Риски/ошибки:** обнаруженный внешний source меняет выбор preparatory task, не scope 8; отсутствие ответа не трактуется как одобрение варианта A.

### FOLLOW-PREP-02 (отложено, не блокирует 8) — подготовить настоящий источник и проверенный read-port

- **Результат:** пригодный source для двух вкладок, реальные edge records/authoritative write path и стабильный read-контракт; не только фикстуры или placeholder [] на production path.
- **Ответственный:** при A — Users backend owner с Gateway DB/migration integrator; при B — подтверждённый external source owner + Gateway integration owner. Конкретного человека discovery не назначает.
- **SOW A:** domain relation/lifecycle из PREP-01, отдельная migration после текущей базы, constraints/indexes, concurrency-safe авторитетная запись, два оптимизированных query ports с User/Profile enrichment, count/snapshot/visibility и DI/export. Общая schema только Gateway; без Prisma в domain/application.
- **SOW B (вместо A, только если выбран B):** source-side недостающие page/visibility/bulk/caller-auth возможности, adapter-ready versioned contract и реальное test environment; точный объём уточняется PREP-01. Это не автоматическое разрешение расширять чужой сервис.
- **Out of scope:** GraphQL fields карточки 8, frontend, изменение Payment lifecycle, публичных counters/REST без отдельного согласования, новый broker/универсальная event platform, незапрошенная очистка данных, source-таблица исключительно для фиктивного наполнения админки.
- **Зависимости:** принято PREP-01; Product отдельно согласовал необходимые write endpoints/импорт, owners и очередь. **Место:** в будущей очереди после PREP-01, **не до начала текущей 8**. Назначение возможно после выбора owner; реализация и приёмка — только по принятому scope.
- **AC:** X→U виден в Followers(U), U→Y — в Following(U), обратное направление не смешивается; pair unique/self-rule соблюдены; follow/unfollow/re-follow либо реальный импорт работают по принятой политике; deleted/blocked/profileless/privacy согласованы; defaults/bounds/page-out-of-range/totalCount и стабильные ties проверены; нет per-row remote lookup; SQL/query timeout и сбои безопасны; возможен одновременный read корректных count/items.
- **DoD:** реальные изолированные DB/transport integration tests, migration на предыдущей схеме с сохранением данных, concurrency/lifecycle и failure regression, documented runnable read examples, exports/contract reviewed schema owner. Для B mock server не заменяет проверку source. Fixtures не считаются доказательством наличия production write path.
- **Риски/ошибки:** внешний count/visibility может оказаться несовместимым, потребуется отдельное согласование extension; неподтверждённое прошлое followedAt нельзя восстановить выдуманными датами; migration/интеграция не выполняются в карточке 7.

## 8. Handoff текущей карточке 8

**Назначить:** можно Gateway backend owner, без назначения data owner несуществующей подсистемы. **Начать:** после завершения документации и merge карточки 7; принятие исследования пользователем уже зафиксировано. Отсутствие social source, отложенные FOLLOW-PREP-01/02 и решения о реальных колонках/privacy больше не блокируют этот этап. **Принять:** после технического review реализованного FOLLOW-ZERO-1 и его проверок. Реализация 8 подготовлена в ветке feature/sa-gql-08-follow-zero от dec5c78; merge/приёмка ещё не заявлены.

Owner карточки 8 готовит тонкие field resolvers и явный временный application query без social repository/transport; SA-GQL-01 owner интегрирует root/common/feature SDL и guide. PR 8 добавил реализованный fragment/типы с тестами в контракт 1.2.0; первоначальная карточка 7 оставляла SDL 1.1.0 без изменений. Новые counters не нужны.

Приёмочные тесты 8: оба поля, defaults и bounds, допустимая page за пределами пустой выборки, malformed input, действующая/expired/revoked admin session, обычный user JWT, повторная nested проверка после parent, aliases/fragments с разными input/parents, missing/deleted parent, отсутствие social I/O и regression текущих auth/catalog/Payments/moderation/budgets. Auth/validation ошибки не превращать в успешный zero result.

Карточка 9 начинается только после завершения, приёмки и merge 8 и проверяет **согласованный временный объём**: пустые социальные вкладки явно обозначены как hardcoded-zero, не как чтение настоящих связей. Отложенный source не блокирует эту приёмку сам по себе; остальные обязательные AC/security/environment вопросы сохраняются. Полная реализация настоящего social graph не заявляется.

## 9. Review и выполненные проверки

Пользователь принял исследовательский результат и временный вариант **19.10.2026**. Это не отдельные approvals Architecture, Security или Frontend. Ранее предложенное review вариантов A/B/C, lifecycle, настоящих колонок/privacy и PREP остаётся отложенным для будущего источника, не условием текущей 8.

Технический schema/document integrator проверяет соответствие PR 8 FOLLOW-ZERO-1, безопасность и planned/implemented статусы; эта обычная техническая проверка не приписывается уже выполненной. Open AC profileUrl карточки 3 и прочие перечисленные production-вопросы не закрыты.

В первоначальном discovery выполнена статическая сверка и read-only buildSchema/assertValidSchema для runtime composition: Query superadminSession/superadminUsers/superadminUser; mutations login/logout/block/unblock/delete; SuperadminUser содержит основные поля и payments, но не followers/following. В историческом docs-only проходе карточки 7 сверен SDL 1.1.0 без приложения/БД/тестовых наборов; проверки реализации 8 описаны в дополнении ниже и актуальном guide. Проверки ссылок/нумерации/docs-only diff и git diff --check выполняются перед handoff. Секретов и реальных пользовательских данных ADR не содержит.


## 10. Фактическая реализация SA-GQL-08 — к техническому review

[SuperadminFollowZeroResolver](../../apps/main-gateway-service/src/modules/superadmin/api/superadmin-follow-zero.resolver.ts) вызывает чистую [getTemporaryFollowZero](../../apps/main-gateway-service/src/modules/superadmin/application/get-temporary-follow-zero.ts), зарегистрирован в существующем SuperadminUsersModule. [SDL fragment](../../libs/contracts/src/graphql/superadmin/v1/follow-zero-type-defs.ts) и target 1.2.0 содержат только FOLLOW-ZERO-1, не candidate 0.1. [HTTP/DB тесты](../../apps/main-gateway-service/test/superadmin/superadmin-users.integration-spec.ts) переиспользуют прежний helper и настоящий verifier. Source/repositories/migrations/dependencies/user endpoints не добавлены, публичные counters не менялись; отдельные Architecture/Security/Frontend approvals и production-приёмка не заявляются. См. актуальный [FE guide](../../GRAPHQL_SUPERADMIN_FRONTEND_API.md) с примерами обоих полей/aliases. Исторические доказательства выше не переписаны под новую schema; исходное исследование всё так же доказывает отсутствие пригодного source, не наличие настоящих связей.
