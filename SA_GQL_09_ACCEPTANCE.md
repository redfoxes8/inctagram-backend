# SA-GQL-09 — техническая сквозная проверка

Дата: 19.10.2026. Ветка `test/sa-gql-09-final-acceptance`, исследованная база `a7acfbe` (merge SA-GQL-08). Начальное рабочее дерево чистое. Это отчёт агента, **не пользовательская, browser или production-приёмка**. Контракт 1.2.0; социальные вкладки принимаются только по согласованному FOLLOW-ZERO-1.

## Матрица покрытия

Пути тестов ниже относительно `apps/main-gateway-service/test/`. Указанные наборы выполнены в этом проходе; компонентные проверки переиспользованы, а не продублированы.

| Требование / карточки                                                                                                                                                     | Компонент и автоматизированное доказательство                                                                                                                                 | Инфраструктура / результат                                                                                                | Граница доказательства                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| UC-1, 01/02: login → session → каталог; logout, replacement и независимость браузеров                                                                                     | `SuperadminAuthModule`, `SessionAdminPrincipalVerifier`; `superadmin/admin-auth.integration-spec.ts`; связный сценарий в `superadmin/superadmin-payments.integration-spec.ts` | HTTP Nest/Apollo, настоящая Gateway PostgreSQL; успешно                                                                   | Redirect и реальный браузер не проверены                                                                                                |
| 01/02: hash-only, cookies, 30 min idle / 8 h absolute, минутный touch, revoke races, storage errors, общий rate limit                                                     | Admin repository/use cases; `admin-auth.integration-spec.ts`, два HTTP instances с общим PostgreSQL                                                                           | Настоящая БД; управляемые часы, SQL fault injection; успешно                                                              | Не provision секретов и не проверка ingress IP                                                                                          |
| 01: root/nested guard, обычный JWT, aliases/fragments, безопасные errors/REST filter, Origin/CORS/CSRF, POST/body/depth/complexity/batching, production introspection/IDE | `superadmin/superadmin-infrastructure.spec.ts`; auth/users/payments integration suites                                                                                        | Настоящий GraphQL HTTP; инфраструктурная schema/verifier тестовые, feature suites используют production verifier; успешно | HTTP header/cookie assertions не доказывают browser SameSite/third-party cookie поддержку                                               |
| UC-2/4/5, 03: 8 newest, state/email независимы, profileless/null, trim/literal substring search, четыре DB sort, ID tie, null-last, bounds/empty/out-of-range             | `SuperadminUsersModule`/query repository; `superadmin/superadmin-users.integration-spec.ts`                                                                                   | Настоящая Gateway PostgreSQL, HTTP; успешно                                                                               | Production collation не исследована; `profileUrl=null`, маршрут открыт                                                                  |
| 03: count/items snapshot, отсутствие N+1/записи при чтении                                                                                                                | Тот же suite: одна joined SQL выборка, query spy, управляемый concurrent commit со второго соединения                                                                         | Реальная БД; успешно                                                                                                      | Snapshot внутри ответа, не стабильность отдельных страниц при изменениях                                                                |
| UC-3, 04A/4B/05: outcomes, malformed ID, User/session/audit/outbox atomicity и rollback, no-op/NOT_FOUND audit, конкурентные команды и login/refresh/Google races         | `ModerateUserUseCase`, typed audit writer/row lock; `superadmin/user-state-audit.integration-spec.ts`, `superadmin/user-access-enforcement.integration-spec.ts`               | PostgreSQL, SQL fixtures, controlled barriers/fault injection; успешно                                                    | Google upstream заменён; SQL deleted fixture отдельно от рабочего DELETE use case; Yes/No диалог — FE                                   |
| 04B/05: старый access/refresh, новый login после unblock, DELETED приоритет, stale entity, неизменность admin session                                                     | `UserAccessCheck`, JWT/Session repositories; enforcement suite и связный сценарий                                                                                             | HTTP protected REST и PostgreSQL; успешно                                                                                 | Пользовательского GraphQL API нет; internal user gRPC не публичная JWT-точка                                                            |
| 04B/05: WS handshake/delivery, DB fail-closed, fan-out/disconnect, delete, orphan sockets, delayed/duplicate revoke                                                       | Notification gateway/publisher/revoke consumer; enforcement suite                                                                                                             | Два локальных Nest HTTP/WS Gateway с отдельными queues и настоящий disposable RabbitMQ/PostgreSQL; успешно                | Не staging/two Kubernetes pod. После commit запрещаются последующие проверки; in-flight действия могут закончиться                      |
| 04B/05: broker outage/retry, lease expiry, новое чтение persistent obligation                                                                                             | Существующий relay/outbox, enforcement suite; broker pause/resume, новый relay и AMQP connection, конкурирующие relay                                                         | Настоящие PG/RabbitMQ; успешно                                                                                            | Не kill-pod/process-crash: создаётся новый объект relay. Scheduler/операционный restart целого процесса не проверены                    |
| UC-6, 06: выбранный parent ID, RPC pagination/order/minor units/enums/dates/nulls, aliases, no selection/null parent/auth/input → no RPC                                  | `SuperadminPaymentsModule` → существующий `GetPaymentHistory`; `superadmin/superadmin-payments.integration-spec.ts`, `unit/payment-history-extension.spec.ts`                 | Настоящий gRPC + Payment controller/CQRS handler/repository + отдельная Payment DB; успешно                               | Не полный `PaymentRootModule`, без Stripe/реальных оплат                                                                                |
| 06: timeout/cancel/outage, unknown enum/invalid response, nullable field/path/alias, сохранение parent, обычная REST history                                              | Тот же Payment HTTP suite: управляемый pending gRPC handler и короткий timeout, остановка сервера, fault responses                                                            | Настоящий транспорт; fault handler/ответы тестовые; успешно                                                               | Не production SLA; RxJS timeout/unsubscribe с наблюдаемой transport cancellation, не обещание server deadline                           |
| 05/06: Payment history после delete                                                                                                                                       | Рабочий DELETE use case + реальные transaction/subscription в отдельной Payment DB; Payment suite                                                                             | Строки Payment сохраняются, parent после delete null; успешно                                                             | Нет cancellation/refund/auto-renew команды; политика auto-renew не решена, полный lifecycle не запускался                               |
| UC-6, 07/08: FOLLOW-ZERO-1                                                                                                                                                | `SuperadminFollowZeroResolver`/`getTemporaryFollowZero`; users suite, связный сценарий                                                                                        | HTTP, валидированные defaults/bounds/aliases/fragments/nested guards/null parent; успешно                                 | Только `items=[]`, нулевые counts/pages, независимые page/pageSize; нет social source/network/endpoints. Публичные counters не изменены |
| 01–08: runtime API и FE examples                                                                                                                                          | `GraphQLSchemaHost` всех production superadmin feature modules, сравнение с `runtime.graphql`; parse/validate всех executable GraphQL-блоков FE guide                         | Фактическая executable schema HTTP fixture; успешно                                                                       | Schema validation примеров не означает исполнение всех примеров/JSON variables. Отдельно исполнен связный HTTP journey                  |
| 02/04A/4B: миграционная цепочка                                                                                                                                           | `superadmin/superadmin-migration-chain.integration-spec.ts`, прежние state/audit/enforcement tests                                                                            | PostgreSQL 16 disposable, официальный `migrate deploy` трёх новых миграций; успешно                                       | Legacy baseline подготовлен SQL + `migrate resolve`, не fresh deploy всей истории                                                       |

## Связный сценарий и новые проверки

Добавлен один сценарий в существующий Payment fixture, без новой тестовой платформы: User + Profile → реальный password login/session и protected REST → admin login → session/CSRF reload bootstrap → поиск в каталоге → детали/реальная история платежей/две пустые социальные вкладки → block/401 → unblock/старый token всё ещё 401 → новый password login/200 → delete/401 и отказ нового login → отсутствие в каталоге/null деталей → повторный delete ALREADY_DELETED → четыре audit results с настоящим adminSessionId → admin logout/UNAUTHENTICATED. Изолированные данные удаляются вместе с контейнером.

Дополнительно проверяется каноническое равенство фактической Nest schema экспортированному SDL и schema validation всех executable GraphQL-блоков guide (не менее девяти). Форматирование block strings Prettier не влияет на сравнение типов/полей/nullability/defaults/описаний.

Production-дефектов в выполненном объёме не подтверждено. Исправлены **тестовые** wiring-пробелы: для добавленного ordinary AuthController fixture явно импортирует CqrsModule; прежний bootstrap-DI fixture теперь, как AppModule, импортирует UserAccessModule и проверяет его присутствие. Assertions защиты не ослаблены. Исходники runtime, schema composition, зависимости и миграции не менялись.

Отдельная статическая сверка: `ProfileHttpMapper.toGetProfile` в `apps/main-gateway-service/src/modules/users/api/rest/mappers/profile.http.mapper.ts` по-прежнему возвращает followersCount/followingCount=0; файл не менялся. Поиск по текущим REST controllers не нашёл follow/unfollow, schema assertions исключают такие GraphQL mutations. Это проверка исходников/контракта, не исполнение публичного profile endpoint полного AppModule.

## Команды и результаты

Из корня репозитория; Docker доступен, используются только одноразовые fixtures/helpers. Подробные тестовые имена находятся в перечисленных suites.

```powershell
pnpm exec jest --config apps/main-gateway-service/test/jest.config.ts --runInBand --testPathPatterns='superadmin|jwt-token-type|payment-history-extension|notifications-websocket.gateway|notification-live-event.consumer|notifications.controller|available-payment-products|stripe-checkout-status|payment-entitlement-bootstrap-di' --noStackTrace
```

Первый общий прогон: 17 suites, 208 passed / 2 failed из 210. Причины: формат block string экспортированного SDL и описанный выше устаревший bootstrap fixture. После исправления повторены **только затронутые** suites:

```powershell
pnpm exec jest --config apps/main-gateway-service/test/jest.config.ts --runInBand --runTestsByPath apps/main-gateway-service/test/superadmin/superadmin-payments.integration-spec.ts apps/main-gateway-service/test/unit/payment-entitlement-bootstrap-di.spec.ts --noStackTrace
```

Повторный прогон: **2/2 suites, 30/30 tests passed**. В совокупности с 15 успешными suites общего прогона: **17 suites / 210 tests прошли** (не утверждается один новый полный прогон после исправлений). Отдельный первый запуск Payment + нового migration-chain suite: 30/30 passed до форматирования SDL. Последующее уточнение строкового типа access token устраняет две lint warnings в новом тесте, не меняя его поведение.

После финальных правок документации/типизации выполнен ещё короткий smoke — **2 passed**, 27 намеренно skipped по testNamePattern:

```powershell
pnpm exec jest --config apps/main-gateway-service/test/jest.config.ts --runInBand --runTestsByPath apps/main-gateway-service/test/superadmin/superadmin-payments.integration-spec.ts --testNamePattern='SA-GQL-09 connected|validates every executable' --noStackTrace
```

Итог SDL-проверки: target/runtime/export валидны, версия 1.2.0, экспорт воспроизводим, **9/9** executable примеров guide schema-valid. Scoped ESLint: **0 errors / 0 warnings** после уточнения типа; Prettier check и `git diff --check` успешны.

```powershell
$env:NODE_ENV='test'
$env:PRISMA_DB_URL_DIRECT='postgresql://127.0.0.1:1/generate_only'
pnpm run prisma:generate
pnpm run build:main-gateway-service
pnpm exec tsc -p apps/main-gateway-service/tsconfig.app.json --noEmit --incremental false
pnpm exec eslint apps/main-gateway-service/test/superadmin/isolated-admin-database.ts apps/main-gateway-service/test/superadmin/superadmin-payments.integration-spec.ts apps/main-gateway-service/test/superadmin/superadmin-migration-chain.integration-spec.ts apps/main-gateway-service/test/unit/payment-entitlement-bootstrap-di.spec.ts
pnpm exec prettier --check apps/main-gateway-service/test/superadmin/isolated-admin-database.ts apps/main-gateway-service/test/superadmin/superadmin-payments.integration-spec.ts apps/main-gateway-service/test/superadmin/superadmin-migration-chain.integration-spec.ts apps/main-gateway-service/test/unit/payment-entitlement-bootstrap-di.spec.ts libs/contracts/src/graphql/superadmin/v1/runtime.graphql GRAPHQL_SUPERADMIN_FRONTEND_API.md SA_GQL_09_ACCEPTANCE.md
git diff --check
```

Prisma Client 7.9.0 generation, Gateway webpack build и отдельный CLI source typecheck успешны. URL generation-only не обслуживает БД; env-файлы/секреты не диагностировались. Source + четыре изменённых test files: 0 diagnostics. Дополнительный полный source+все Gateway tests typecheck выявил **две существовавшие в базе** TS2554 в `test/unit/available-payment-products.spec.ts:65,92`: execute ожидает 0 аргументов, тест передаёт Query. Обе строки есть в HEAD, production handler не менялся; несвязанная проблема оставлена явно открытой. Jest этого suite проходит (isolatedModules не заменяет полный typecheck).

Воспроизводимый scoped source/test typecheck без создания дополнительного tsconfig/script:

```powershell
@'
const ts = require('typescript');
const raw = ts.readConfigFile('apps/main-gateway-service/tsconfig.app.json', ts.sys.readFile);
const config = ts.parseJsonConfigFileContent(raw.config, ts.sys, 'apps/main-gateway-service');
const tests = require('child_process').execFileSync('git',
  ['ls-files', '--modified', '--others', '--exclude-standard'], { encoding: 'utf8' }
).split(/\r?\n/).filter(p => p.includes('/test/') && p.endsWith('.ts'));
const program = ts.createProgram([...new Set([...config.fileNames, ...tests])],
  { ...config.options, noEmit: true, incremental: false });
const errors = ts.getPreEmitDiagnostics(program);
console.log(ts.formatDiagnosticsWithColorAndContext(errors, {
  getCurrentDirectory: ts.sys.getCurrentDirectory, getCanonicalFileName: p => p,
  getNewLine: () => '\n'
}));
console.log('Gateway source + changed tests: ' + errors.length + ' diagnostics');
process.exitCode = errors.length ? 1 : 0;
'@ | node
```

Prettier применяется только к изменённым tests/SDL/новому отчёту и API guide; план правится точечно. Предупреждение pg о concurrent client.query deprecated не провалило tests; переход на pg9/переписывание adapter вне scope.

### Миграции и запуск

Новый helper option `deployFromMigration` применяется только в тестах. На одноразовой PG сначала SQL-файлами в отдельных транзакциях подготавливается старая схема, каждая старая миграция отмечается через `prisma migrate resolve --applied`. Перед `20261018120000_add_admin_sessions` создаются User/Profile/Session fixtures. Затем **одна штатная команда** `prisma migrate deploy --config apps/main-gateway-service/src/core/prisma/prisma.config.ts` применяет AdminSession → user_state_audit → user_access_revoke_outbox. `_prisma_migrations.finished_at` проверен для всех трёх, данные/flags сохранены, default isBanned=false и новые таблицы доступны. Прежний 4A suite отдельно проверяет сохранность уже существующего AdminSession и transactional audit.

Это воспроизводимый тест перехода с явно baselined старой схемы, **не** доказательство clean `migrate deploy` всей legacy истории. Deployment owner должен согласовать baseline/resolve для фактического окружения и штатно применить migrations; reset/shared DB не использовались.

Startup smoke выполнен как настоящие listen/init/HTTP/gRPC/WS тестовых Nest composition с production feature modules, repositories и guards. Дополнительный bootstrap-DI test проверяет регистрации AppModule, но **полный `main.ts`/`AppModule.forRoot` процесс не запускался**: безопасная fixture не поднимает Post/File/Notification upstream, mail/Google и прочую внешнюю конфигурацию полного приложения. Production bootstrap, schedule/reconnect/ingress и процессный restart остаются deployment-проверками; сокращённый модуль не подтверждает их.

## Незакрытые условия и рекомендация

- **Требования ТЗ:** public profile route неизвестен, `profileUrl=null`; AC Profile link карточки 3 открыт (Frontend/Product). Фото и остальные nullable-поля работают по фактическим данным. Backend не проверяет redirect, визуальные таблицы и диалог Yes/No. FOLLOW-ZERO-1 — согласованное ограничение, не реальные связи.
- **Браузерная интеграция:** точные admin origins (Frontend/Deployment), HTTPS/SameSite/third-party cookies (Deployment/Security), секреты и их provision (Security/Operations). Пустой allow-list остаётся запрещающим; адреса не выдуманы.
- **Эксплуатация:** штатный migration baseline/deploy, full startup, trusted ingress peer IP, staging/two-pod fan-out/revoke, clocks/monitoring/retention/reconnect и настоящий process/pod crash recovery — Operations/Gateway owner. Локальные два Gateway не staging.
- **Production-политики:** назначение общей fixed account вне учебной проверки, владелец/смена с отзывом сессий (Product/Security); публичные profiles/posts/files/comments/notifications после delete и активный paid auto-renew (Product/соответствующие domain owners). Soft delete не отменяет подписку.
- **Репозиторная проверка:** две baseline ошибки полного test typecheck выше не устранены; scoped source/изменённые tests проверяются отдельно. Human API/security review не приписывается выполненным тестам.

Проверенный backend scope рекомендован к техническому review/merge с явным учётом двух baseline test-typecheck ошибок и границ startup/deployment проверки; **полностью зелёный общий test typecheck не заявляется**. Это не полное соответствие исходному ТЗ и не production-ready. Решение о merge/приёмке остаётся пользователю; commit/push/merge не выполнялись. Маршрут девяти карточек и scope не изменены; новая социальная подсистема не требуется.
