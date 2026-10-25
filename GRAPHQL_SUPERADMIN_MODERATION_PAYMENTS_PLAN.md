# Следующая итерация GraphQL суперadminки: moderation и Payments list

## 1. Статус и правила ведения

**APPROVED PLAN — утверждён пользователем 25.10.2026, включая технические стартовые параметры. S1 реализован и проверен, подготовлен к техническому review; S2 и дальнейшая реализация не начаты.** Дата: 25.10.2026, Europe/Kiev. Исследован `dev`, commit `0e122b3b0257abe6d6772cf5ebff1eb70a657109`. Исходное дерево чистое; создана ветка `docs/superadmin-moderation-payments-plan`. Прочитан корневой `Agents.md`, иных применимых AGENTS при ограниченном поиске не найдено.

**Уточнение 25.10.2026:** R1/R2 и продуктовые R4–R7 решены пользователем; выбор Payment read model и eventual consistency R8 принят. Visibility и создание comments/reactions отложены вне текущей реализации и не блокируют сокращённый scope. Последующим запросом пользователь утвердил эту редакцию и технические стартовые параметры; повторные продуктовые согласования для S1 не нужны.

Это единый план требований/решений/прогресса новой итерации, не новые Jira-карточки и не замена прежнего плана 1–9. Первоначальный docs-only проход сохранял runtime **1.2.0**, не менял код и не запускал проверки приложения. После реализации S1 runtime/target — **1.3.0**: опубликован только additive banFilter, без reason или общего Payments. Исходная карта E1–E13 ниже описывает исследованный commit до S1; текущий результат — в разделе S1 и журнале.

Метки: **ТЗ** — задано пользователем; **код** — подтверждено ниже; **принято** — ранее согласованное решение; **предложение** — ещё не согласовано; **вопрос** — неизвестно. Чекбокс `[x]` означает конкретный завершённый результат с доказательством, не обещание реализации или приёмку пользователем.

## 2. Исходное ТЗ и границы frontend/backend

### UC-1. Блокировка

- Users list: 8 последних созданных пользователей; меню **Ban in the system**.
- Подтверждение: `Are you sure you want to ban __Username__?`.
- Причины: **Bad behavior**, **Advertising placement**, **Another reason**. Для Another reason появляется ввод текста.
- После Yes пользователь блокируется и теряет доступ к системе; все его комментарии и реакции — лайки/дизлайки — скрываются и не учитываются. **Скрытие не означает физическое удаление**.
- No/закрытие формы не вызывают блокировку. Ручная проверка — только новый disposable user через Swagger; существующие аккаунты студентов не блокировать.

### UC-2. Разблокировка

- Users list: 8 последних записей. Фильтр: **Not selected — все; Blocked — заблокированные; Not blocked — незаблокированные**.
- Меню **Un-ban**, подтверждение `Are you sure you want to un-ban __Username__?`.
- Yes разблокирует; No/крестик ничего не меняют.
- **Принято ранее:** unblock не восстанавливает отозванные сессии, нужен новый login.

### UC-3. Общий список платежей

- Отдельный **Payments list** всех пользователей платформы, не `superadminUser.payments`.
- Колонки: фото пользователя, username, дата, сумма, подписка, метод оплаты.
- По умолчанию 6 последних записей; на странице 6 записей.
- Поиск по username; сортировки по username, Date added, Amount, Payment Method. Направления и точный смысл части колонок в ТЗ не заданы.

Frontend: меню/диалоги, выбор причины/текста, Yes/No, визуальные таблицы. Backend: контракт, validation, сохранение/чтение, фактические access/visibility ограничения. Backend-тесты не подтверждают диалоги и не должны вызывать mutation при No/закрытии. UI не получает навязанных дополнительных колонок.

### Scope / Out of scope

**Входит:** совместимое расширение существующей moderation причиной и atomic audit, фильтр существующего Users list, узкий Payment-side profile read model/sync и полноценный общий административный Payments list с принятыми поиском/сортировками. Переиспользовать auth/context/guards/CSRF, audit/row lock/session revoke/outbox patterns и существующий Payment gRPC channel. Текущая готовность оценивается по этому сокращённому объёму, без claims полного visibility UC-1.

**Не входит:** frontend, Jira, новый сервис/брокер/IAM/event-платформа, comments/likes/dislikes source, любые подготовительные задачи его создания и сама visibility/её подсчёты, реальные платежи, Stripe/PayPal lifecycle, cancellation/refund/auto-renew, hard delete/restore, очистка публичных данных, реальный social graph и public read/edit API причины. Admin credentials/fallbacks, FOLLOW-ZERO-1, soft delete и прочие независимые решения не переоткрывать. Чужая БД напрямую не читается; user GetPaymentHistory и REST history сохраняются.

## 3. Карта кода и доказательства

Все пути от корня; символ после ссылки — точка проверки, не ссылка на историческое описание вместо реализации.

| ID  | Подтверждённый факт                                                                                                                                                                                                                 | Файл / символ                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E1  | Schema-first, `/graphql` + global prefix, root/nested guards/filters, общий scalar, budgets, безопасные errors                                                                                                                      | [superadmin.module.ts](apps/main-gateway-service/src/modules/superadmin/superadmin.module.ts) `SuperadminModule.withRuntime`; [context](apps/main-gateway-service/src/modules/superadmin/api/superadmin-context.ts) `createSuperadminContext`; [errors](apps/main-gateway-service/src/modules/superadmin/api/superadmin-errors.ts) `formatSuperadminError`                                                                                                                                                                                                                                                                                                               |
| E2  | Admin principal берётся из проверенной cookie session, не user JWT; mutations требуют CSRF, login/logout — узкие исключения                                                                                                         | [guard](apps/main-gateway-service/src/modules/superadmin/api/superadmin.guard.ts) `SuperadminGuard.canActivate`; [verifier](apps/main-gateway-service/src/modules/superadmin/infrastructure/session-admin-principal.verifier.ts) `verify`; [HTTP](apps/main-gateway-service/src/modules/superadmin/api/superadmin-http-security.ts) `setupSuperadminHttp`, `assertSuperadminCsrf`                                                                                                                                                                                                                                                                                        |
| E3  | Runtime 1.2.0: каталог/детали, auth, block/unblock/delete, Payments одного parent и FOLLOW-ZERO-1; новых полей этой итерации нет                                                                                                    | [runtime.graphql](libs/contracts/src/graphql/superadmin/v1/runtime.graphql) `Query`, `SuperadminUsersInput`, `SuperadminUserIdInput`; [composition](libs/contracts/src/graphql/superadmin/v1/runtime-type-defs.ts) `SUPERADMIN_RUNTIME_TYPE_DEFS`; [guide](GRAPHQL_SUPERADMIN_FRONTEND_API.md)                                                                                                                                                                                                                                                                                                                                                                           |
| E4  | User имеет isBanned/isConfirmed/deletedAt; Profile optional, username/avatar в Gateway. Текущей причины/текста нет; audit не содержит причины                                                                                       | [Gateway schema](apps/main-gateway-service/src/core/prisma/schema.prisma) `User`, `Profile`, `AdminUserActionAudit`, `UserAccessRevokeOutbox`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| E5  | Каталог исключает deleted, включает blocked/unconfirmed/profileless. Literal case-insensitive substring до count/page; 4 sort, null-last username и ID tie; один SQL snapshot. Ban-фильтра нет                                      | [repository](apps/main-gateway-service/src/modules/users/infrastructure/superadmin-users.query-repository.ts) `PrismaSuperadminUsersQueryRepository.findPage/findUser`; [query](apps/main-gateway-service/src/modules/users/application/queries/get-superadmin-users.query.ts) `GetSuperadminUsersQuery.execute`; [input](apps/main-gateway-service/src/modules/superadmin/api/superadmin-users.input.ts) `SuperadminUsersInput`; [types](libs/common/types/superadmin-users.ts) `SuperadminUsersFilter`                                                                                                                                                                 |
| E6  | BLOCK/UNBLOCK/DELETE сериализуются в одной Gateway tx; все outcomes, включая no-op/NOT_FOUND, пишут audit. Повтор BLOCK не меняет User/сессии/outbox                                                                                | [use case](apps/main-gateway-service/src/modules/users/application/commands/moderate-user.usecase.ts) `ModerateUserUseCase.execute`; [repository](apps/main-gateway-service/src/modules/users/infrastructure/user-moderation.repository.ts) `setBanned`, `lockUser`, `revokeSessionsAndEnqueue`; [lock](apps/main-gateway-service/src/core/prisma/transactions/lock-gateway-user.ts) `lockGatewayUser`                                                                                                                                                                                                                                                                   |
| E7  | Writer требует тот же живой tx; идентификаторы audit без обязательных FK. Resolver принимает только userId, actor берёт из principal                                                                                                | [audit](apps/main-gateway-service/src/modules/users/infrastructure/admin-user-action-audit.writer.ts) `PrismaAdminUserActionAuditWriter.append`; [port](apps/main-gateway-service/src/modules/users/domain/interfaces/admin-user-action-audit.writer.ts) `append`; [resolver](apps/main-gateway-service/src/modules/superadmin/api/superadmin-moderation.resolver.ts) `block/unblock/sessionId`; [SDL](libs/contracts/src/graphql/superadmin/v1/moderation-type-defs.ts) `SuperadminUserIdInput`                                                                                                                                                                         |
| E8  | Access/session enforcement и durable revoke уже есть. Unblock не восстанавливает sessions; revoke event — не универсальный user/profile/visibility event                                                                            | [check](apps/main-gateway-service/src/modules/sessions/application/user-access-check.ts) `UserAccessCheck.verify`; [SQL check](apps/main-gateway-service/src/modules/sessions/infrastructure/user-access-session.query.ts) `PrismaUserAccessSessionQuery.findActive`; [relay](apps/main-gateway-service/src/modules/users/infrastructure/outbox/user-access-revoke-relay.ts) `UserAccessRevokeRelay.relay`; [event](libs/contracts/src/user-access-revoked.ts) `UserAccessRevoked`                                                                                                                                                                                       |
| E9  | В Post schema — Post/PostImage/OutboxEvent, ownerId относится к посту, не авторству отсутствующего комментария. Post proto содержит CRUD/list/count постов, но не comments/reactions                                                | [Post schema](apps/micro-post-service/prisma/schema.prisma) `Post`, `PostImage`; [proto](libs/contracts/src/proto/post.proto) `PostService`; [repository](apps/micro-post-service/src/modules/posts/infrastructure/repositories/post.query-repository.ts) `PostQueryRepository.getLatestPosts`                                                                                                                                                                                                                                                                                                                                                                           |
| E10 | История строго одного userId; все transaction statuses без фильтра, order createdAt DESC/id DESC; product/subscription/checkout join, суммы minor units. Два запроса в tx без явного isolation — не доказательство одного snapshot  | [Payment repository](apps/micro-payment-service/src/modules/payment/infrastructure/repositories/payment-query.repository.ts) `PaymentQueryRepository.getPaymentHistory`; [handler](apps/micro-payment-service/src/modules/payment/application/queries/get-payment-history.query.ts) `GetPaymentHistoryHandler.execute`; [proto](libs/contracts/src/proto/payment.proto) `GetPaymentHistoryRequest/Response`, `PaymentHistoryItem`, `PaymentService`                                                                                                                                                                                                                      |
| E11 | Отдельные Payment/User DB: transaction содержит userId, amountMinor/currency, provider, createdAt/paidAt, product/subscription links; username/photo/card brand нет. Есть Payment outbox, но это не готовая полная реплика платежей | [Payment schema](apps/micro-payment-service/src/core/prisma/schema.prisma) `PaymentTransaction`, `Product`, `Subscription`, `OutboxEvent`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| E12 | Gateway history field берёт ID parent, timeout/mapping вне resolver; общий RPC отсутствует. REST history привязан к CurrentUserId. Внутренний Payment controller не содержит admin guard                                            | [field](apps/main-gateway-service/src/modules/superadmin/api/superadmin-payments.resolver.ts) `SuperadminPaymentsResolver.history`; [adapter](apps/main-gateway-service/src/modules/superadmin/infrastructure/grpc-superadmin-payment-history.ts) `GrpcSuperadminPaymentHistory.getHistory`; [client](apps/main-gateway-service/src/modules/payments/infrastructure/payment-grpc.client.ts) `getPaymentHistoryWithTimeout`; [REST](apps/main-gateway-service/src/modules/payments/api/payment.controller.ts) `PaymentController.getPaymentHistory`; [controller](apps/micro-payment-service/src/modules/payment/api/grpc/payment-grpc.controller.ts) `getPaymentHistory` |
| E13 | Нет готового bounded profile batch/export RPC. Username может меняться; надёжного потока его изменений в проверенном пути нет. Avatar relay читает все PENDING как avatar-события: нельзя просто положить туда новые profile events | [User proto](libs/contracts/src/proto/user.proto) `UserService`; [update](apps/main-gateway-service/src/modules/users/application/use-cases/update-profile.use-case.ts) `UpdateProfileUseCase.execute`; [save](apps/main-gateway-service/src/modules/users/infrastructure/profile.repository.ts) `ProfileRepository.save`; [relay](apps/main-gateway-service/src/modules/users/infrastructure/outbox/avatar-outbox-relay.cron.ts) `AvatarOutboxRelayCron.handleOutboxRelay`                                                                                                                                                                                              |

### Разрывы требований

| Требование                               | Уже есть / отсутствует                               | Владелец данных                           | Необходимое изменение / зависимость                                                                                                           |
| ---------------------------------------- | ---------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| UC-1: бан/потеря защищённого доступа     | E6–E8 готовы; причины пока нет E4/E7                 | Gateway Users/Sessions                    | Расширить прежний use case/tx по принятым R1/R2; не новый ban pipeline                                                                        |
| UC-1: текущая причина/текст и история    | Полей в User/audit пока нет E4                       | Gateway Users/security                    | Nullable legacy storage и typed audit snapshot по R1/R2; публичное чтение причины вне scope                                                   |
| UC-1: comments/reactions hidden + counts | Source/авторство/агрегаты не найдены E9              | Не установлен в проверенном коде          | Отложено по решению пользователя. Ни создание source, ни V0/V1 не являются prerequisites текущего scope; полный visibility UC-1 не заявляется |
| UC-2: 8 newest / unblock / новый login   | E5/E6/E8 готовы                                      | Gateway Users/Sessions                    | Сохранить поведение; подтверждение No/Yes — FE                                                                                                |
| UC-2: фильтр                             | В E5 нет параметра и SQL predicate                   | Gateway Users                             | Additive enum/input → query port → SQL до count/page; email confirmation отдельно                                                             |
| UC-3: global history                     | E10/E12 — selected user, не общий список             | Payment MS                                | Новый internal admin read RPC/repository query, user RPC без изменений; семантика R4–R8 принята                                               |
| UC-3: фото/username + global search/sort | Разные БД E4/E11; sync отсутствует E13               | Gateway owner Profile; Payment projection | Принят узкий username/deleted/version read model в Payment, фото одним Gateway batch≤6; технический протокол раздела 5 на review              |
| UC-3: дата/сумма/подписка/метод          | Факты доступны E10/E11, общий read ещё не реализован | Payment                                   | R4–R7 решены: createdAt/product+длительность/provider/all statuses/raw amountMinor+currency, ASC/DESC; не выдумывать card details/FX          |

### Граница вывода о комментариях/реакциях

Ограниченный поиск по именам файлов и моделям/миграциям `apps/`, proto `libs/contracts/src/proto`, затем целевым Gateway Posts/Post MS: `comment`, `reaction`, `like/dislike`, варианты counts и domain classes. Generated Prisma clients, обычные комментарии к коду и платежные subscriptions не считались источником. В проверенных schema/migrations/DTO/proto/read paths нет пригодных сущностей comments/reactions и их агрегатов; отдельных тестовых файлов по именам также не обнаружено. Это **не доказательство отсутствия внешнего/незамерженного компонента**. Нельзя применять User.isBanned к несуществующему read path и объявлять visibility реализованной.

## 4. Принятые решения по moderation и совместимости

**Согласовано пользователем 25.10.2026 (R1/R2):**

- Старый block без причины остаётся допустимым; новый frontend передаёт причину. Старым блокировкам причина не придумывается. Нет срока автоматического отключения legacy вызова и нет breaking required input.
- Повтор BLOCK → ALREADY_BLOCKED, текущая причина не меняется, новых revoke/outbox для этого no-op нет; один audit результата сохраняется. Отдельного API редактирования причины не будет.
- UNBLOCK очищает текущую причину, история остаётся в audit. Сессии не восстанавливаются, нужен новый login; приоритет DELETED и прежние outcomes сохраняются.
- ANOTHER_REASON: обязательный текст после trim, 1–500 символов. Стандартные причины: непустой после trim свободный текст отклоняется; пустой нормализуется в null. Если reason передан, validation выполняется до изменения данных.
- Причина, isBanned, session revoke, audit и существующий revoke outbox используют одну Gateway tx и прежний User row lock. Сбой audit/outbox откатывает переход; tx не удерживается во время publish. Actor берётся из principal.
- **Чтение причины в admin list/detail в текущий объём не входит.** Хранить текущую причину и историю достаточно; не добавлять banReason в response/SDL как «удобную» незаданную колонку.

**Техническая форма на review, без альтернативной бизнес-семантики:** оставить `SuperadminUserIdInput!` неизменным и добавить optional аргумент `reason: SuperadminBanReasonInput` только к существующей block mutation. Так старые documents/variables продолжают валидироваться, delete/unblock не получают лишних полей. Не создавать вторую mutation/механизм блокировки. Omission/null reason у legacy первого block → null code/text, не выдуманный BAD_BEHAVIOR/ANOTHER_REASON; новая FE-форма передаёт reason.

В модели — nullable `User.banReasonCode/banReasonText` и nullable reason snapshot существующего AdminUserActionAudit. Коды BAD_BEHAVIOR / ADVERTISING_PLACEMENT / ANOTHER_REASON соответствуют трём причинам ТЗ. Это проект хранения для S2, не уже существующие поля. Текст — plain text, не HTML; frontend экранирует вывод. Техническая детализация audit: BLOCK/ALREADY_BLOCKED фиксирует сохранённую причину результата, UNBLOCK — причину до очистки; прежние audit rows не переписываются, проигнорированный новый текст не выдаётся за текущую причину. Legacy/missing/deleted → допустимый null. Schema/typed writer должны сохранять прежние гарантии и не логировать свободный текст.

При расширении entity/mapper/save paths проверить, что обычное сохранение устаревшей User entity не очищает причину. Пользовательские DTO её не принимают. Internal locked read может читать причину для транзакции/audit — это не новый публичный read API.

**Комментарии/реакции — решение пользователя R3, отложено вне текущей итерации:** пригодного источника в проверенном репозитории нет (границы доказательства E9 сохранены). Новую comments/likes/dislikes подсистему и подготовительные задачи её создания не включать. Скрытие и исключение из counts отложены до настоящего источника, отсутствие source не блокирует filter/reason/Payments. Не создавать фиктивные endpoints ради отметки о заглушке, найденные существующие заглушки сохранять.

Будущая политика согласована: после unblock действия снова видимы/учитываются, если нет другого основания скрывать. Сейчас она **не реализуется и не проверяется**. Виды targets и конкретные read/count predicates определяются при будущем появлении source; не создавать реакции на новые виды объектов по аналогии. E8 revoke v1 не объявляется готовой visibility-синхронизацией. Готовность сокращённого объёма отделяется от **невыполненного исходного visibility-требования UC-1**.

## 5. Общий Payments list: принятая граница сервисов и sync

### Принятая архитектура R8

**Согласовано пользователем 25.10.2026:** узкий read model в Payment DB, не реплика платежей в Gateway. Gateway остаётся owner User/Profile; Payment хранит только userId, username, признак удаления и технические state/version признаки. Все filters/order/count выполняются на Payment стороне **до** pagination. Username ответа берётся из того же snapshot проекции. Фото Gateway обогащает одним локальным ограниченным SELECT для ≤6 distinct user IDs страницы. Нет прямого доступа к чужой БД, unbounded IDs, полной загрузки записей в память, нового сервиса/брокера или универсальной event platform.

GetPaymentHistory(user_id,...) остаётся без изменения. Новый admin-oriented read RPC возвращает userId строки и общую страницу, использует существующий PaymentGrpcClient/channel/error mapping. Обогащение уже полученной страницы не может заменить глобальный username search/sort. Вариант репликации платёжных строк в Gateway **отклонён для этой итерации**, это не параллельное готовое решение.

**Eventual consistency принята:** две БД не совпадают мгновенно; при сбое копия может временно устареть, после восстановления обязана догнать источник. Нет числового SLA задержки без измерений и нет общей cross-service транзакции. Внутри Payment DB count/items и username для сортировки/вывода читаются одним SQL snapshot либо explicit Repeatable Read tx. Обычная пара запросов в READ COMMITTED это не гарантирует (E10).

### Один конкретный минимальный технический протокол (утверждён планом; реализация впереди)

Ниже выбран один проект, не перечень несовместимых вариантов. Он основан на существующем User row lock/tx E6, confirms/lease/retry образце E8, отсутствии пригодного profile stream E13. Названия новых внутренних объектов рабочие; они **ещё не реализованы**.

1. **Версия у источника.** Добавить в Gateway User `paymentProfileVersion: BigInt`, начальное 0 для прежних rows. Версия не timestamp и не Profile.updatedAt. Все create User, profile creation, username rename и soft delete захватывают прежний User lock и записывают финальное source state + увеличение версии + `PaymentUserProfileOutbox` **в одной транзакции**. Для нового User версия начинается с 1; если create User/Profile идут разными tx, обе порождают последовательные snapshots. Если одной — достаточно финального snapshot tx. Версию/row lock применять во всех реальных password/Google/profile creation путях; не менять обычные password/access правила. Техническую версию изменяет только этот source writer под lock; ordinary entity mapper не записывает её из устаревшей entity. Изменение только avatar не требует события: фото читается в Gateway.
2. **Полный scoped snapshot, не delta.** Событие `PaymentUserProfileChangedV1`: eventId, userId, sourceVersion (decimal string в proto/event, без потери BigInt), username?, profileExists, isDeleted. Без email/password/avatar/session/token. Отдельный userExists в live event не нужен: source User существует или сохраняется soft-delete tombstone. Прежний User без Profile экспортируется с profileExists=false/username=null; deleted — isDeleted=true/username=null. Любой rename/profile update под lock проверяет deletedAt: после delete не создаёт более новую «живую» копию.
3. **Durable отправка.** Отдельная узкая таблица `PaymentUserProfileOutbox`: payload/version, attempts, availableAt, leaseId/leaseUntil, publishedAt/безопасный error code. Не использовать общую PENDING таблицу avatar relay (E13) и не менять payload/назначение UserAccessRevokeOutbox. Небольшой scoped relay на существующем AmqpConnection использует проверенный подход claim/lease/confirm/retry E8; сетевой publish вне tx, опубликовано только после broker confirm и без unhandled returned/unroutable сообщения. Рабочие технические параметры — прежний образец: lease 30 s, publish bound 5 s, retry backoff 2..60 s; это предложение реализации, не SLA.
4. **Очередь и rollout.** Existing `common_exchange`, отдельный routing key/тип только для profile snapshot; одна durable, не exclusive/auto-delete очередь Payment (`payment.superadmin.user-profile.v1` — рабочее имя). Экземпляры Payment конкурируют за её сообщения; это не ephemeral WS fan-out. Сначала Payment migration/consumer и очередь/binding (readiness=false), затем Gateway source/outbox/export; bootstrap — только после завершения rollout **всех** Gateway writers с единым version/outbox правилом, без старых writers. Live события за это время сохраняются/применяются по версиям. Не включать publisher в topology без получателя; unroutable/отказ confirm не удаляет obligation. Ack consumer — после commit применения; DB failure → retry, safe diagnostics без payload. Не строить новую IAM/event-платформу.
5. **Проекция и повторы.** Payment table `AdminUserProfileReadModel`: userId PK, sourceVersion, username?, profileExists, isDeleted. Один conditional upsert: missing → insert; incomingVersion > stored → update; ≤ → no-op. Полный snapshot позволяет восстановить пропуск нескольких версий сразу. Tombstone сохраняется и не отменяется запоздалым profile update; при отсутствии restore в scope запрещено переводить deleted projection обратно в live даже более новой некорректной командой. Такое нарушение диагностируется безопасно, не «исправляется» воскресшим профилем.
6. **Один bounded export для bootstrap и сверки.** Новый внутренний Gateway read RPC `ExportPaymentUserProfiles(afterUserId, upperUserId, limit)`: keyset по стабильному User.id, User LEFT JOIN Profile **одним SQL statement**, включает soft-deleted rows/версию и profileExists, не выдаёт секреты. Начало прохода фиксирует upperUserId=MAX(id); cap batch=500 — техническое предложение. Ни один вызов не держит snapshot/tx на весь проход и не возвращает всех пользователей. В Payment готовый UserService client при точечном поиске не найден: для export нужен один scoped Payment→Gateway gRPC read client к уже имеющемуся [внутреннему Gateway server](apps/main-gateway-service/service.yaml) (Service gRPC port 50050), не channel на каждую строку и не новый сервис. Фактический внутренний endpoint проверяется по окружению; это не изменение существующего Gateway→Payment channel общего списка. Новые User за верхней границей/позади курсора покрываются live snapshots.
7. **Граница bootstrap/live.** Durable consumer/queue существует до source rollout/export. Live snapshots применяются одновременно с batches **тем же** version-guarded upsert. Пачка и advancement bootstrap cursor фиксируются в одной Payment tx; после restart повтор batch безопасен, старый export не затирает новый event. User/profile mutation до чтения batch видна в batch, после чтения — имеет durable outbox event; между разными tx данные не теряются из-за keyset boundary. Обновления обязаны идти через источник с пунктом 1; прямой SQL мимо него не считается поддерживаемым mutation API.
8. **Readiness честная.** Одна небольшая служебная запись Payment (`AdminUserProjectionSync`) хранит phase NOT_READY/LOADING/READY, upper bound, cursor и время последней сверки; не новая платформа jobs. READY — после полного применения baseline и сохранённого завершения прохода, при работающем consumer; не по одному признаку «queue пуста». До этого общий read RPC отвечает безопасной unavailable/not-ready ошибкой → Gateway UPSTREAM_UNAVAILABLE, а не успешными нулями. READY не обещает нулевой live lag: события, ещё находящиеся в outbox/очереди, догонят snapshot по принятой eventual consistency.
9. **Воспроизводимое восстановление.** Durable retry — основной путь после outage. Дополнительно тот же export/apply запускает низкочастотную keyset-сверку: **один проход раз в 24 часа**, а также один coalesced проход после длительного восстановления/по операторской команде. Batch≤500, сохраняемый cursor/upper bound, не более одной пачки в секунду, один worker через lease служебной записи; сбой продолжает курсор, а не начинает full scan каждую секунду. Сравниваются версии: missing/отстающий row получает актуальный snapshot, новые target версии не перезаписываются. Если trusted source export при сверке обнаружил одинаковую версию с разным содержимым, это диагностируемое нарушение, например след mixed-version rollout: исправить authoritative snapshot условным compare-and-set **только при всё ещё той же target версии**, не отменяя tombstone. Доставка события с равной версией такой repair не делает; более новая target версия всегда защищена. После rollout неподдерживаемые записи мимо source протокола не допускаются. Период/размер/throttle — **технические предложения**, обоснование: replay чинит обычный outage, редкий bounded проход страхует пропуски без scan на каждом UI-запросе. Это не измеренный SLA; публичный recovery API не нужен. Фоновая сверка после первоначального READY сама по себе не сбрасывает готовность и не блокирует UI; текущая копия может читаться с согласованной eventual consistency, а настоящий storage failure остаётся ошибкой.
10. **Проверяемость.** Нужны controlled гонки create/profile creation/rename/delete с batch export, reverse delivery/duplicate, outage+resume, crash между batch apply/cursor commit, readiness и recovery одного пропущенного revision. Bootstrap и consumer используют одну apply-функцию/порт, не две реализации правил. Накопление outbox/lag/ошибки наблюдаемы безопасными метриками/кодами; payload не логируется.

### Enrichment и различение отсутствия/ошибки

Gateway одним локальным запросом читает User/Profile для ID страницы, **включая deletedAt**. Не использовать обычный repository, скрывающий deleted, если это не позволяет отличить состояние.

- User жив, Profile есть: username остаётся из Payment snapshot, avatar из текущего Gateway Profile; не подменять username свежим значением после сортировки.
- User жив, Profile отсутствует: avatar=null; source profileExists=false/username=null является нормальным отсутствием Profile. Если профиль создан после snapshot, временно старый username допустим до sync; полнота не выдумывается.
- User уже deleted либо отсутствует в Gateway: username и avatar **обязательно null**, даже если проекция ещё содержит старое имя. Платёжная строка сохраняется. Это защитное исключение из snapshot username для устаревшего профиля, не пересортировка/удаление строк после pagination.
- Missing projection row **не доказывает**, что User отсутствует в Gateway. Для выбранной страницы batch различает неизвестного source User и живого User с отсутствующей копией: второе — sync gap/unavailable, а не выдуманный null Profile. До ready gap вообще не выдаётся как нормальные данные. Ошибка БД/RPC не приравнивается к unknown user/profileless; запрос завершается безопасной ошибкой.
- После sync deleted/missing username не матчится непустым search. **При гонке** search/count могли выбрать строку по ещё старому username, а enrichment уже обнулит профиль. Не менять затем count/страницу, не загружать все записи для компенсации: состав/totalCount отражают snapshot отстающей проекции, после catch-up результат поиска изменится. Это явное ограничение согласованной eventual consistency, не обещание общего snapshot двух сервисов.

### Внутренняя граница доступа

Переиспользовать существующий внутренний gRPC channel и Gateway admin guard. PaymentGrpcController E12 не проверяет admin principal/caller identity; [Payment Service](apps/micro-payment-service/service.yaml) описывает внутренний Service с gRPC port, без внешнего типа. Это подтверждает способ подключения, **не** наличие authenticated caller/mTLS или проверенной NetworkPolicy. Новый admin read и Gateway export не публиковать через внешний HTTP/GraphQL user API, не передавать admin cookie/token в MS. Для окружения Operations проверяет отсутствие публичного ingress/port exposure и существующие сетевые ограничения; если их фактически нет, это deployment/security условие, а не повод изобретать IAM или объявлять RPC защищённым аутентификацией. Архитектура R8 принята, новые IAM-вопросы не блокируют независимый Users filter.

### Принятые значения колонок и порядка R4–R7

| Колонка / правило | Решение пользователя 25.10.2026                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Фото / username   | Nullable Profile; платежи deleted/missing users сохраняются, профильные значения null. Непустой username search их не включает после catch-up; конкурентное ограничение описано выше       |
| Date added        | PaymentTransaction.createdAt, не User.createdAt и не paidAt                                                                                                                                |
| «Подписка»        | Название продукта и длительность (productName/billingInterval/count), без выдуманного исторического snapshot и без подмены активной подпиской пользователя                                 |
| Amount            | Числовой amountMinor, исходная currency возвращается/отображается. Без FX; сортировка чисел разных валют не обещает экономическую эквивалентность                                          |
| Payment Method    | Существующий provider STRIPE/PAYPAL, не card brand/last4                                                                                                                                   |
| Строки            | Все transaction statuses как в текущей истории, не только successful payments                                                                                                              |
| Порядок/пагинация | По 6; default createdAt DESC, transaction ID DESC. Username/createdAt/amountMinor/provider — ASC и DESC, stable transaction ID tie в том же направлении. Username NULLS LAST в обе стороны |
| Поиск             | Как существующий каталог: trim, empty→no filter, literal case-insensitive substring, normalized max100, null username не матчится                                                          |

Числовые суммы/даты/enums использовать из существующих проверенных мапперов; неизвестный upstream enum/повреждённый ответ — ошибка, не выдуманное допустимое значение. Существующие product facts не объявляются исторически неизменными.

## 6. API: фильтр опубликован, остальные дополнения ещё кандидат

Продуктовые R1/R2/R4–R8 решены пользователем; технические имена/формы ниже проверяются при review этой версии плана. Не менять target/runtime SDL до реализованных resolvers/tests. Владельцы common SDL/guards/pagination/errors остаются Gateway integrator; Payment proto/generated — Payment+Gateway contract owner, один integration PR. S1 уже опубликован в composition/target/runtime export версии 1.3.0: только additive banFilter, без новых operations/response fields. Reason и общий Payments в runtime не добавлены; последующие дополнения версионируются отдельно по фактической готовности, без breaking required reason.

```graphql
# Additive к существующему SuperadminUsersInput:
enum SuperadminUsersBanFilter {
  ALL
  BLOCKED
  NOT_BLOCKED
}
# banFilter: SuperadminUsersBanFilter! = ALL

enum SuperadminBanReasonCode {
  BAD_BEHAVIOR
  ADVERTISING_PLACEMENT
  ANOTHER_REASON
}
input SuperadminBanReasonInput {
  code: SuperadminBanReasonCode!
  text: String
}
# Описание существующего поля, не второе объявление:
# superadminBlockUser(input: SuperadminUserIdInput!, reason: SuperadminBanReasonInput): SuperadminBlockUserPayload!

enum SuperadminPaymentsSort {
  USERNAME_ASC
  USERNAME_DESC
  CREATED_AT_ASC
  CREATED_AT_DESC
  AMOUNT_ASC
  AMOUNT_DESC
  PAYMENT_METHOD_ASC
  PAYMENT_METHOD_DESC
}
input SuperadminPaymentsInput {
  page: Int! = 1
  searchUsername: String
  sort: SuperadminPaymentsSort! = CREATED_AT_DESC
}
# Query.superadminPayments(input: SuperadminPaymentsInput!): SuperadminPaymentsPage
```

**Users:** ALL → без нового predicate; BLOCKED → isBanned=true; NOT_BLOCKED → false. Все варианты сохраняют deletedAt IS NULL, независимый isEmailConfirmed, search/sort, joined snapshot count/items. UI Not selected соответствует ALL. Добавить enum/default/проверку, тип фильтра и SQL clause — не второй Users list. Старые запросы без banFilter сохраняют поведение. Defaults/bounds 1/8, page≤10000/pageSize≤50 и normalized search≤100 сохраняются (E5 и [PaginationInput](libs/common/src/graphql/pagination-input.ts)).

**Причина:** reason отсутствует/null → legacy вызов без причины допустим. Если объект передан, code обязателен и валидируется, ANOTHER_REASON требует trimmed text 1..500, стандартные причины отклоняют непустой text. Неверные code/text → BAD_USER_INPUT до tx; UUID/outcomes и actor из principal прежние. ALREADY_BLOCKED не редактирует причину, USER_DELETED/NOT_FOUND её не создают. **Не добавлять reason/banReason в admin list/detail output**, новый read API или edit-reason mutation. Внутреннее хранение/чтение для use case/audit — S2/S3.

**Payments:** fixed pageSize=6, новый input не открывает pageSize клиенту и не меняет общий PageInput default=8. Переиспользовать page validation 1..10000 и PageInfo; internal RPC получает page*size=6. Search как каталог: trim, empty→no filter, literal case-insensitive substring, normalized max100; null username не матчится. SQL параметры; %, *, backslash и кавычки — текст, без wildcard синтаксиса.

`SuperadminPaymentsPage`: non-null items/totalCount/pageInfo, nullable root query для UPSTREAM_UNAVAILABLE без потери других root data. Строка содержит transactionId/userId, nullable username/avatarUrl, createdAt DateTime, amountMinor/currency, productName/billingInterval/billingIntervalCount, provider/status. Новые card details, «исторический snapshot продукта», FX или поля ради неопределённой функции не добавлять. Reuse enums/DateTime/safe Int bounds. Смысл полей согласован в разделе 5; технический SDL-кандидат не объявляется уже опубликованным API.

Пустая выборка: items=[], totalCount=0, pageInfo={page, pageSize:6, pagesCount:0, hasNextPage:false}. Допустимая page за диапазоном: items=[], count/pagesCount всей отфильтрованной выборки, hasNextPage=false. Count/order до LIMIT/OFFSET в Payment DB; между запросами страниц стабильность при изменениях не обещается. Username null-last, ID tie в направлении основного ключа, Amount — raw amountMinor без FX, метод — provider code, не локализованный label. Все статусы как user history.

После source catch-up deleted/missing users не входят в непустой username search. При concurrent enrichment suppression возможен описанный в разделе 5 временный stale search/count с null профилем; не обещать общий snapshot и не переписывать count по одной странице.

Timeout нового RPC — конечный существующий лимит, без automatic retry. Outage/not-ready/timeout → null + UPSTREAM_UNAVAILABLE с корректным path/alias; auth → UNAUTHENTICATED/FORBIDDEN, input → BAD_USER_INPUT, неожиданные ошибки → безопасный INTERNAL_SERVER_ERROR. Ошибки не превращаются в items=[], а unknown user/profileless не смешиваются с storage failure. Старое `superadminUser.payments` и его null boundary не меняются.

## 7. Последовательные этапы

**Текущий маршрут:** technical review S0 → Users filter S1 → модель причины S2 → reason use case/GraphQL S3 → детализация sync P0 → подготовка Payments read model/sync P1 → общий RPC/GraphQL P2 → итоговая сверка F. V0/V1 отложены, не входят в зависимости этого маршрута. Причина/фильтр/общие платежи реализуются полноценно, не заглушками.

Внутри вертикали: контракт → модели/миграции и repository → application → transport/wiring → узкие integration checks → документация. Не держать все направления в одном большом незавершённом PR. Выполнен только S1; чекбоксы S2/S3/P0/P1/P2/F и отложенных V0/V1 остаются пустыми.

### S0 — review технической формы плана, без повторного Product-согласования

- [x] 25.10.2026 — пользователь утвердил план, включая технические стартовые параметры; S0 для начала S1 пройден. Это утверждение плана, не выполненная реализация будущего P0 или других этапов.
- Владельцы: Gateway+Payment integration/Architecture; Frontend проверяет использование новых аргументов. Продуктовые R1/R2/R4–R7 и архитектура/eventual consistency R8 уже согласованы пользователем, их не переоткрывать.
- Зависимости: нет. Завершение: technical contract достаточно точен для выбранного следующего слоя, без claims о caller auth/общем snapshot и без новых visibility prerequisites. Проверка — сверка с E1–E13/текущим SDL, без запуска приложения. Первый кодовый шаг S1 выполнен и проверен; следующий незавершённый этап — S2.

### S1 — первая независимая реализация: фильтр существующего Users list

- [x] 25.10.2026 — banFilter ALL/BLOCKED/NOT_BLOCKED с default ALL проведён через shared type → DTO/существующий query spread → repository SQL до count/page; users feature SDL/target/runtime export обновлены до 1.3.0.
- Gateway: E5, libs/common/types/superadmin-users.ts и имеющиеся modules. **Миграция не нужна:** isBanned уже есть. Зависимость — S0 filter-часть, не comments/reactions, reason или Payments.
- Завершение: default сохраняет поведение, filter сочетается с username search/4 sort/page, deleted скрыты, email confirmation отдельно, snapshot/count и отсутствие N+1 сохранены.
- Минимум проверок: existing users fixture, таблица states×filter, один combined search/page/count, invalid enum; старые guard/sort tests не дублировать. Затем точечные FE guide/runtime export updates.

**Доказательство S1:** ветка `feature/superadmin-users-ban-filter` создана непосредственно от `origin/dev`, база `0e122b3b0257abe6d6772cf5ebff1eb70a657109`; fetch успешен, docs-ветка не имела дополнительных commits. Неотслеживаемый файл плана сохранён целиком при переключении (SHA-256 до/после совпал); далее обновлены только утверждение/прогресс и относящиеся к S1 статусы.

- `SuperadminUsersBanFilter` / `SuperadminUsersFilter` — `libs/common/types/superadmin-users.ts`; DTO — `superadmin-users.input.ts`, default ALL + IsEnum.
- `GetSuperadminUsersQuery.execute` уже передаёт `...input`; повторная логика не добавлена. `PrismaSuperadminUsersQueryRepository.findPage` добавляет параметризованный boolean predicate в прежний filtered CTE, общий count/items snapshot сохранён.
- Существующий `superadmin-users.integration-spec.ts`: **46/46 passed** на настоящем изолированном PostgreSQL и GraphQL HTTP, включая 5 новых случаев (3 enum variants, combined filter/search/page/count, invalid enum до repository read). Прежние legacy omission/4 sort/guards/snapshot/no-N+1 проверки переиспользованы. Actual GraphQLSchemaHost канонически совпадает с экспортом runtime.graphql; new input/enum совпадают с target.
- Gateway build и source typecheck успешны; source + catalogue test typecheck: **0 diagnostics**; scoped ESLint/Prettier и diff-check успешны. Прежние монорепозиторные baseline issues не исправлялись.
- Только S1: без migration/Prisma schema/dependencies, без auth/fallback/cookie/CSRF/moderation изменений, без Payments sync/RPC. FE guide обновлён точечно; response shape прежний. **Следующий незавершённый этап — S2; не начат.**

Команды проверок S1 (из корня):

```powershell
pnpm exec jest --config apps/main-gateway-service/test/jest.config.ts --runInBand --runTestsByPath apps/main-gateway-service/test/superadmin/superadmin-users.integration-spec.ts --noStackTrace
pnpm run build:main-gateway-service
pnpm exec tsc -p apps/main-gateway-service/tsconfig.app.json --noEmit --incremental false
pnpm exec eslint libs/common/types/superadmin-users.ts apps/main-gateway-service/src/modules/superadmin/api/superadmin-users.input.ts apps/main-gateway-service/src/modules/users/infrastructure/superadmin-users.query-repository.ts libs/contracts/src/graphql/superadmin/v1/users-type-defs.ts libs/contracts/src/graphql/superadmin/v1/common-type-defs.ts apps/main-gateway-service/test/superadmin/superadmin-users.integration-spec.ts
pnpm exec prettier --check libs/common/types/superadmin-users.ts apps/main-gateway-service/src/modules/superadmin/api/superadmin-users.input.ts apps/main-gateway-service/src/modules/users/infrastructure/superadmin-users.query-repository.ts libs/contracts/src/graphql/superadmin/v1/users-type-defs.ts libs/contracts/src/graphql/superadmin/v1/common-type-defs.ts libs/contracts/src/graphql/superadmin/v1/target.graphql libs/contracts/src/graphql/superadmin/v1/runtime.graphql apps/main-gateway-service/test/superadmin/superadmin-users.integration-spec.ts GRAPHQL_SUPERADMIN_FRONTEND_API.md GRAPHQL_SUPERADMIN_MODERATION_PAYMENTS_PLAN.md
git diff --check
```

Scoped source/test typecheck использует TypeScript API с Gateway tsconfig, noEmit/incremental=false и добавленным root `apps/main-gateway-service/test/superadmin/superadmin-users.integration-spec.ts`, без создания нового tsconfig/test framework.

```powershell
@'
const ts=require('typescript');const raw=ts.readConfigFile('apps/main-gateway-service/tsconfig.app.json',ts.sys.readFile);
const config=ts.parseJsonConfigFileContent(raw.config,ts.sys,'apps/main-gateway-service');
const program=ts.createProgram([...config.fileNames,'apps/main-gateway-service/test/superadmin/superadmin-users.integration-spec.ts'],{...config.options,noEmit:true,incremental:false});
const diagnostics=ts.getPreEmitDiagnostics(program);
console.log(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:file=>file,getCurrentDirectory:ts.sys.getCurrentDirectory,getNewLine:()=> '\n'}));
console.log('Scoped source + catalogue tests: '+diagnostics.length+' diagnostics');
process.exitCode=diagnostics.length?1:0;
'@ | node
```

### S2 — модель причины и transactional repositories

- [ ] Добавить nullable текущую причину и audit snapshot, новую неразрушительную миграцию, typed ports/mappers/writer и tx запись под прежним User lock; проверить ordinary save/stale entity.
- Gateway Users/domain/application ports/Prisma infrastructure; E6/E7, прежний transaction manager. Зависимость — S1 по маршруту и technical review формы R1/R2; бизнес-решения приняты.
- Завершение: legacy rows без выдуманной причины, Profile/Session/AdminSession/audit/outbox сохранены; reason/state/audit используют тот же handle, domain/application без Prisma типов. Нет новых public read полей причины.
- Проверки: migrate deploy на изолированной предыдущей схеме; reason mapping/validation boundary, rollback User+reason+audit и один stale-entity regression. Не shared DB/reset/редактирование старых миграций.

### S3 — reason use case, GraphQL и wiring

- [ ] Расширить прежний ModerateUserUseCase/Resolver optional reason с принятыми BLOCK/no-op/UNBLOCK/deleted правилами и atomic audit/outbox; **без read/edit-reason API**.
- Gateway application → API/SDL/modules. Зависимость S2; старые block-вызовы без reason сохраняются, новая FE передаёт reason.
- Завершение: валидный повтор даёт ALREADY_BLOCKED и не меняет причину; unblock очищает текущую и не оживляет sessions; одна завершённая команда/один audit result, без нового auth/revoke pipeline.
- Проверки: 3 причины/условный текст и legacy omission; один repeat/unblock цикл, один controlled concurrent block с разными причинами, rollback audit/outbox; guard/CSRF smoke без повторения session suite. Затем docs/runtime/target version sync. Это завершает reason-часть сокращённого scope, не отложенную visibility UC-1.

### V0 — отложено: источник visibility, вне текущей итерации

- [ ] В будущей отдельно согласованной работе подтвердить настоящий owner/source comments/reactions и targets; создание source сейчас **не планируется как prerequisite**.
- Scope сейчас — только сохранить ограничение/исследовательские доказательства E9. Никаких новых моделей/endpoints/подготовительных задач создания подсистемы; существующие заглушки сохранить.
- Зависимости/завершение: для будущего возобновления нужны появившийся source и отдельное решение о scope. Минимальная будущая проверка — точные read/count контракты владельца. Не блокирует S1–S3/P0–P2/F.

### V1 — отложено: visibility, вне текущей приёмки

- [ ] Когда настоящий source появится в отдельной работе, скрыть/исключить действия blocked автора из реальных lists/counts; после unblock снова учитывать, если нет другого основания скрытия.
- Зависимость только будущая V0/готовый source; **не** часть текущей последовательности и не разрешение создавать comments/likes/dislikes.
- Завершение/проверки в будущем: реальные списки/counts владельца, ban/unban и другие причины скрытия. Сейчас не реализовано/не проверено, checkbox не закрывается. Полное исходное visibility-требование остаётся невыполненным, сокращённая итерация может быть принята независимо.

### P0 — техническая детализация принятого Payments sync/read контракта

- [ ] Зафиксировать рабочие имена/версии событий, dedicated outbox/queue, User revision, batch export/apply/cursor/ready и recovery по единому протоколу раздела 5, включая порядок rollout.
- Gateway+Payment integration; зависимости S3 по последовательному маршруту и S0. Product R4–R7/выбор read model/eventual consistency R8 решены; не возвращать их в Blocked.
- Завершение: контракт producer/consumer/export/admin read определён, никакого нового IAM, публичного export или unbounded IDs. Минимум: design review гонок rename/delete на границе bootstrap и concurrent enrichment, сверка имеющейся internal network boundary. Числа batch/reconcile — technical proposals, не измеренный SLA.

### P1 — подготовка read model/sync и repositories

- [ ] Реализовать User revision + scoped transactional outbox для всех source create/profile/rename/delete путей; durable retry/conditional apply/tombstone, bounded bootstrap/readiness/reconciliation. Затем Payment global SQL snapshot/count и Gateway enrichment ≤6 IDs.
- Gateway source/infrastructure + Payment Prisma/repository/consumer. Зависимость P0; миграции только своих БД, один migration owner на сервис; не создавать generic event/job платформу.
- Завершение: атомарность source+obligation; все writers охвачены; live/export не теряют boundary; old/duplicate events не затирают новый state/tombstone; not-ready не маскируется пустыми профилями; unknown/profileless/storage failure различаются.
- Минимум проверок на reused isolated fixtures: миграция с прежними rows, одна tx rollback, controlled bootstrap/live race с rename/delete/create, duplicate/out-of-order/tombstone, outage/retry/recovery/cursor-resume и missing revision сверка; один SQL snapshot и один bounded enrichment spy. Число tests определяется рисками, не количеством методов. Не дублировать Stripe lifecycle/session suites.
- Для concurrent delete проверить обязательное null username/avatar без пересортировки страницы/count; stale projection search/count явно допустимы до catch-up.

### P2 — application query, admin RPC, GraphQL и wiring

- [ ] Добавить отдельный GetSuperadminPaymentsPage (рабочее имя) proto/handler/port и Gateway adapter/root query, fixed 6, validation/timeout/safe mapping; user history RPC/REST не менять.
- Payment application/transport + Gateway application/API/feature SDL. Зависимость P1; proto/generated интегрирует один contract owner до зависимых изменений.
- Завершение: глобальные search/order/count до page, принятые date/product-duration/provider/all-status/raw-amount semantics, nullable profile/deleted rules, отсутствие N+1. Admin guard и существующий channel/network boundary без mutation-only CSRF и без forwarding admin secrets.
- Минимум: реальный GraphQL→gRPC→Payment repository/DB набор для global username поиска/8 sorts **до pagination**, metadata/6, minor units/currency, missing/profileless/deleted и enrichment race; outage/not-ready/timeout/unknown enum безопасны. Переиспользовать existing auth smoke, не повторять login/session каждый раз.

### F — итоговая сверка сокращённого согласованного объёма

- [ ] Обновить прежний FE guide, target/runtime export/version, примеры и журнал; сверить filter/reason/global Payments вместе и прежний selected-user history.
- Gateway integrator + владельцы вертикалей. Зависимости — S1/S2/S3/P0/P1/P2 реально завершены; **V0/V1 не блокируют текущую приёмку**.
- Завершение: согласованный сокращённый scope готов по автоматизированным доказательствам; исходная comments/reactions visibility явно остаётся отложенной/непроверенной. Не заявлять полное соответствие исходному UC-1.
- Минимум: scoped regression в конце/при изменении общего механизма, Gateway/изменённый Payment build/typecheck/lint/format, schema/examples/diff checks. Изолированные миграции; без FE/production/вымышленных source readiness claims.

## 8. Реестр решений и только оставшиеся технические уточнения

| ID  | Статус / кто согласовал                                    | Текущее решение и граница                                                                                                                                                                                                                         |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Решено пользователем, 25.10.2026                           | Старый block без reason допустим, новый FE передаёт. Без invented reason для legacy и без breaking required input; optional аргумент — выбранная техническая форма для review                                                                     |
| R2  | Решено пользователем, 25.10.2026                           | Повтор не меняет причину; unblock очищает текущую, audit сохраняет историю. ANOTHER_REASON trim 1..500; стандартные причины отвергают непустой текст; один tx. Read/edit reason API не добавлять                                                  |
| R3  | Решено пользователем, отложено                             | Source в проверенном коде отсутствует. Visibility и создание source вне текущей итерации; после будущего unblock действия снова видимы при отсутствии другого основания скрытия. Сейчас не реализовано/не проверено, текущий scope не блокирует   |
| R4  | Решено пользователем, 25.10.2026                           | Дата = PaymentTransaction.createdAt; подписка = productName + длительность, без исторического snapshot                                                                                                                                            |
| R5  | Решено пользователем, 25.10.2026                           | Метод = STRIPE/PAYPAL provider, все статусы как история; card brand/last4 не выдумывать                                                                                                                                                           |
| R6  | Решено пользователем, 25.10.2026                           | ASC/DESC для 4 полей, стабильный ID, username null-last; amountMinor numeric sort с currency, без FX/обещания economic equivalence                                                                                                                |
| R7  | Решено пользователем, 25.10.2026                           | Платежи deleted/missing сохраняются, username/avatar null; после catch-up не матчятся непустым search. При enrichment уже удалённого Gateway User профиль подавляется немедленно относительно этого чтения, stale search/count отдельно оговорены |
| R8  | Архитектура/eventual consistency согласованы пользователем | Узкий Payment-side profile read model, фото одним Gateway batch, существующие RabbitMQ/gRPC. Конкретный минимальный протокол раздела 5 — техническая детализация на review; числовой SLA не задан и не выдумывается                               |
| R9  | Прежние вопросы остаются открытыми у прежних владельцев    | Public profile route, deployment/origins/browser, rotation/operations, политики публичных данных/auto-renew не закрыты. Не блокируют независимые принятые filter/reason/Payments части                                                            |

**Оставшееся — не повторные продуктовые блокеры:** review технических имён/типов/version encoding и параметров batches/периодичности раздела 5 (Gateway+Payment owners); проверить реальные private RPC exposure/network restrictions в окружении (Operations/Security); актуальные прежние environment/product вопросы R9. Authenticated caller/mTLS/NetworkPolicy не подтверждены кодом и не объявляются существующими. Не требуются новая IAM-платформа, source comments/reactions либо выбор между двумя архитектурами: R1–R8 в указанном объёме уже решены.

Пользователь утвердил план, включая технические стартовые параметры; реализован и проверен только S1. Продуктовые вопросы не блокируют S1; новые этапы, в том числе P0, не объявляются выполненными утверждением плана. S1 готовится к техническому review, не production-приёмке.

## 9. Правила реализации и обновления прогресса

**Правило минимального scope пользователя:** упоминание неопределённой функции/отсутствующий источник не разрешает строить новую domain подсистему. Существующую заглушку сохранять; при необходимости только предложить минимальное явно документированное ограничение/заглушку, без новых API/моделей исключительно ради неё. Для comments/reactions сейчас новые endpoints/заглушки не создаются. Это **не** разрешение заменить реальные платежи, upstream errors или результаты поиска фиктивными нулями: согласованные reason/filter/global Payments реализуются полноценно. Отложенное visibility-требование явно не выполнено.

- Понятные domain names, небольшие функции с одной задачей, явные типы на границах, thin resolvers. Читаемые условия вместо вложенных тернарных выражений; не копировать существующий сложный conditional только из-за соседства.
- Следовать Agents.md/DDD: application errors — DomainException; domain/application без Prisma типов, инфраструктура через ports/действующий tx handle; common DTO/enums/contracts в соответствующих libs. Обычные пользовательские DTO не открывают moderation fields.
- SQL параметризованный/структурированный; order выбирается из закрытого enum, не конкатенация пользовательского SQL. Нет ненужных фабрик/универсальных frameworks/DataLoader без доказанного N+1.
- Комментарии объясняют причину/ограничения; errors идут через существующий safe mapping, без raw upstream/секретов. Не рефакторить независимый качественный код ради вкуса.
- Изолированные disposable fixtures/helpers, никаких student accounts/shared/production DB. Повторять общий regression только в конце или при затронутой общей защите; каждый слой проверять минимальным поведением/риском, не количеством tests.
- Готовые наборы для расширения, не новые платформы: [users integration](apps/main-gateway-service/test/superadmin/superadmin-users.integration-spec.ts), [moderation/access integration](apps/main-gateway-service/test/superadmin/user-access-enforcement.integration-spec.ts), [Payment HTTP/gRPC integration](apps/main-gateway-service/test/superadmin/superadmin-payments.integration-spec.ts); helpers [Gateway DB](apps/main-gateway-service/test/superadmin/isolated-admin-database.ts), [Payment DB](apps/main-gateway-service/test/superadmin/isolated-payment-database.ts), [RabbitMQ](apps/main-gateway-service/test/superadmin/isolated-rabbit.ts). В этом discovery они не запускались; реальные integration и test doubles отмечать отдельно в следующих проходах.
- После **реальной реализации и проверки** агент ставит `[x]`, пишет краткое доказательство/команду/результат и следующий незавершённый шаг. При blocker checkbox остаётся пустым, записываются причина/владелец/условие снятия. Наличие старого block endpoint не закрывает UC-1; новый RPC/schema без работоспособного join не закрывает UC-3.

## 10. Журнал завершённых этапов

25.10.2026 — внесены явные решения пользователя по причине/legacy compatibility, отсрочке visibility, Payment колонкам/порядку/deleted users и Payment-side read model/eventual consistency. Выбран единый технический sync-проект для review; реализация/проверки новых компонентов не начаты, новые implementation checkbox не закрыты.

- [x] 25.10.2026 — проверены dev/чистое дерево/commit и Agents.md, создана docs-ветка; выполнен ограниченный code discovery E1–E13, записаны исходное ТЗ, разрывы и API-кандидат. Это чтение кода, не повторная сертификация прежних tests.
- [x] Ранее готовые компоненты подтверждены кодом: admin infrastructure E1/E2, User state + tx moderation/audit/revoke E4/E6–E8, existing catalog и selected-user Payment history E5/E10/E12. На момент исследования новая причина, фильтр и общий Payments не были выполнены; последующий результат S1 зафиксирован отдельно, причина/общие Payments остаются впереди.
- [x] 25.10.2026 — план утверждён пользователем, включая технические стартовые параметры. S0 согласован; выполнение P0 и других будущих этапов из этого не следует.
- [x] 25.10.2026 — **S1 выполнен и проверен**, без миграции; contract 1.3.0, 46/46 catalogue integration tests. Подготовлен к техническому review, commit/push/merge не выполнялись. **Следующий шаг — S2**, не начат; затем S3 → P0 → P1 → P2 → F. V0/V1 остаются вне текущей реализации.
