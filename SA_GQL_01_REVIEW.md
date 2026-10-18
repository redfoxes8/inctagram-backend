# SA-GQL-01 — материалы точечного review

Статус: подготовлено к человеческому review, карточка не принята. Ветка: `feature/sa-gql-01-graphql-infrastructure`. Ниже сохранены материалы исходного review относительно HEAD. Последующее согласованное дополнение обновляет целевой контракт до **1.1.0**: `superadminSession` запланирована для SA-GQL-02. Query root выбран пользователем; runtime endpoint и resolver не включены. Dependency set и lockfile в этом проходе не менялись; commit/push/merge не выполнялись.

## 1. Зависимости: доказательства и вывод

Добавлены fixed direct dependencies: `@nestjs/graphql@13.4.5`, `@nestjs/apollo@13.4.5`, `@apollo/server@5.5.1`, `@as-integrations/express5@1.1.2`, `graphql@16.14.2`, `express@5.2.1`. Apollo client не добавлен.

**Версии существующих пакетов не обновлены.** В `git show HEAD:pnpm-lock.yaml` уже находятся Nest Core/Platform Express 11.1.19 и Express 5.2.1. Package manifest прежде задавал Nest через диапазон ^11.0.1, resolved lock — 11.1.19. Express раньше был транзитивным dependency `@nestjs/platform-express@11.1.19`; сейчас объявлен прямым, поскольку новый HTTP security module импортирует `express.json`, а integration требует peer Express ^5. Это закрепляет уже используемую версию и обеспечивает PNPM resolution прямого импорта.

Lockfile: 66 добавленных entries в секции packages; ни один прежний package/version key не удалён. Помимо нового графа зависимостей, у `@nestlab/google-recaptcha@3.11.1` изменился peer-qualified snapshot key: появился доступный optional GraphQL peer. Версия recaptcha осталась 3.11.1. Это объясняет две заменённые строки lockfile, не обновление старого пакета.

| Компонент                 | Проверенная совместимость                                 |
| ------------------------- | --------------------------------------------------------- |
| Nest GraphQL 13.4.5       | Nest common/core ^11.0.1; graphql ^16.11.0 или ^17        |
| Nest Apollo 13.4.5        | Nest ^11.0.1; GraphQL module ^13; Apollo server ^5        |
| Apollo Server 5.5.1       | Node >=20; graphql ^16.11.0                               |
| Express integration 1.1.2 | Node >=20; Express ^5; Apollo ^4 или ^5                   |
| HTTP adapter              | Nest platform-express 11.1.19 использует Express 5.2.1    |
| Runtime                   | Локальный Node 22.13.1; Docker Gateway использует Node 22 |

Peer-warning: `@nestjs/apollo@13.4.5 → @apollo/server-plugin-landing-page-graphql-playground@4.0.1` с peer `@apollo/server ^4`, фактически server 5.5.1. Это реальное транзитивное несоответствие. Исходный install, Gateway build и isolated runtime smoke прошли. Дополнительная проверка фактических команд CI install в отдельных временных каталогах тоже завершилась успешно (подробности ниже). Пакет остаётся установленным и его module импортируется Apollo driver; при `playground:false` plugin factory не вызывается и landing page не регистрируется. Внешняя stricter CI policy не проверена, поэтому результат не гарантирует любой возможный strict install. Dependency set, flags и project policy ради установки не менялись.

### Проверка реальных команд установки

Репозиторий декларирует `packageManager: pnpm@10.13.1`; проверен локальный pnpm 10.13.1, Node 22.13.1, npm 10.9.2. Project `.npmrc`, `.pnpmfile.cjs` и GitHub workflows не обнаружены; в `pnpm-workspace.yaml` есть build-script allow policy, но нет `strict-peer-dependencies`. Локально `pnpm config get strict-peer-dependencies` → `undefined`; npm strict/legacy peer defaults → false. Значения секретов и содержимое внешних npmrc/env не выводились. Отсутствие project setting не доказывает отсутствие Jenkins/global/secret settings.

Gateway Jenkinsfile выполняет `docker.build` с `apps/main-gateway-service/Dockerfile` и build args service/port. В Gateway Dockerfile уже есть `npm install --no-audit --no-fund --legacy-peer-deps`, без pnpm lock install. Dockerfiles Files/Post/Payment/Notification используют `corepack enable` и `pnpm install --frozen-lockfile`. В просмотренных активных шагах/ENV нет strict peer flags; закомментированные старые yarn test stages не являются выполняемым CI. Внешние настройки Jenkins и фактическое содержимое тега `node:22-alpine` недоступны этой локальной проверке.

Команды воспроизведены в двух подкаталогах уникального `%TEMP%/sa-gql-01-install-*`, с копиями текущих manifests; рабочее дерево не использовалось как install destination:

| Команда                                               | Входные файлы                                      | Результат                                                                                                            |
| ----------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                      | package.json, pnpm-lock.yaml, pnpm-workspace.yaml  | exit 0; lockfile up to date, resolution skipped; 1157 packages; ignored-build-script warning не заблокировал install |
| `npm install --no-audit --no-fund --legacy-peer-deps` | package.json, как install-stage Gateway Dockerfile | exit 0; 1107 packages; deprecation warning Playground не заблокировал install                                        |

Никакие strict настройки не отключались и новые ignore/override не добавлялись. `--legacy-peer-deps` воспроизводит существующий Gateway Dockerfile, а не является внесённым обходом. npm не использует pnpm lockfile: диапазоны manifest разрешаются заново только во временном каталоге. Поэтому это доказательство успешности **установки**, а не сборки того же dependency graph внутри Linux image.

Отдельный npm warning: `@whatwg-node/promise-helpers@2.0.0` требует Node >=22.15.0, локальный Node 22.13.1 ниже этого требования; текущая команда завершилась с exit 0. Это другой риск независимого npm resolution, не Playground peer error. Docker base tag Node 22 не закрепляет patch; фактическую версию CI image нужно проверить владельцу deployment. Менять Node image/dependency set массово в SA-GQL-01 не требуется на основании успешных установок; отдельное исправление нужно только если реальное CI подтвердит blocker.

**Вывод:** видимые в репозитории команды install успешно воспроизведены локально, Playground не блокирует их. CI/deployment целиком, внешняя strict policy и Linux build этим не подтверждены; изменение dependency set для обхода warning не обосновано.

Временные install-копии остались вне репозитория в `%TEMP%/sa-gql-01-install-7cbb93e19ff3409b819173018ed75e9b`: автоматическая политика отклонила проверенное рекурсивное удаление с причиной `blocked by policy`. Повторные попытки обхода не выполнялись. Hash-проверка подтвердила совпадение исходных manifest/lockfile с копиями PNPM после установки; исходный package.json совпал и с npm-копией.

Источники: локальные package.json установленных версий и исходный lockfile; [Nest quick start](https://docs.nestjs.com/graphql/quick-start), [Apollo Express middleware](https://www.apollographql.com/docs/apollo-server/api/express-middleware).

## 2. Общий exception filter

Полный diff приведён ниже. Добавлены только GraphQL context branch и return type `unknown`. Раньше DomainException попадал в HTTP-ветку с `switchToHttp().getResponse()`, что неприменимо к GraphQL resolver context. Теперь GraphQL branch возвращает exception движку; Apollo `formatSuperadminError` преобразует domain code в разрешённый GraphQL code и фиксированное безопасное message, удаляя domain extensions/raw details.

Filter регистрируется в `libs/common/src/setup/app-setup.ts::appSetup`; его используют Gateway, Files, Post, Payment и Notification service (последний через `core/setup-notification-app.ts`), а также gateway Auth/Sessions e2e fixtures. Для RPC сохраняется прежний early return; HTTP status/body mapping и logging branch не изменены.

Gateway-specific `SuperadminExceptionFilter` санитизирует прочие GraphQL errors, не передавая unexpected error в стандартное логирование stack/сообщения. Для non-GraphQL он делегирует прежнему Nest BaseExceptionFilter. Реальная `appSetup` используется в smoke: REST fixture error возвращает точно `400 {code:400,message:"REST unchanged",extensions:[]}`; GraphQL DomainException даёт BAD_USER_INPUT/FORBIDDEN/UPSTREAM_UNAVAILABLE, unexpected — INTERNAL_SERVER_ERROR. Тест проверяет response на отсутствие private/password/token/stacktrace и Logger calls на отсутствие тестовых secret markers. Это targeted evidence, не утверждение о полном тестировании всех сервисов.

## 3. Query root: решение согласовано пользователем, реализация — SA-GQL-02

GraphQL schema обязана иметь непустой root Query; mutations-only schema недопустима. Это требование [GraphQL specification](https://spec.graphql.org/September2025/#sec-Root-Operation-Types), а не особенность именования root или настройка prefix. Новый тест вызывает настоящий `SuperadminModule.withRuntime`/Nest Apollo с common SDL + только Mutation и подтверждает ошибку startup `Query root type must be provided`.

Существующая инфраструктура поддерживает два режима: plain `SuperadminModule` без runtime endpoint либо `withRuntime` с валидной реализованной schema. Ни typeDefs, ни отключённая introspection не снимают обязательность Query. Целевой SDL **1.1.0** теперь содержит согласованную `Query.superadminSession: SuperadminSessionPayload!`, где `authenticated: Boolean!`, для карточки 2.

**Решено пользователем:** query защищена общей admin-проверкой, при действующей session читает подтверждённое состояние и возвращает `{ authenticated: true }`; без действующей session — `UNAUTHENTICATED`. Token/cookie/hash/credentials не возвращаются. Query не public exception и не успешная заглушка. FE использует её для проверки текущей session; технический сбой не равнозначен отсутствию session.

Runtime по-прежнему отключён в SA-GQL-01. Карточка 2 реализует `superadminSession`, login/logout и session verifier, после чего включает endpoint без ожидания каталога карточки 3. Новая query сейчас присутствует только в target SDL/документации; текущая runtime/test schema не получила её resolver. Тексты карточек на доске не менялись; согласованное дополнение зафиксировано в repository plan. Выбор Query root больше не блокер.

## 4. Admin origins: что подтверждено

В `main.ts::corsAllowedOrigins` подтверждены значения существующего общего REST allow-list:

- `http://localhost:3000`
- `https://dev.it-incubator.ru:3000`
- `https://dev.nymbi.org:3000`
- `https://nymbi.org`
- `https://www.nymbi.org`

Это не подтверждение адреса нового frontend суперadminки. `FRONTEND_URL` берётся из config/secret, README перечисляет имя переменной, а manifest содержит secretKeyRef, не публичное значение. Notification WS имеет отдельную переменную и local fallback; её origins также не утверждены как admin origins. Env/secret values не выводились.

`SUPERADMIN_ALLOWED_ORIGINS` описана в FE guide и читается bootstrap; в текущем deployment manifest она ещё не подключена. Неизвестны точные admin origins по средам и фактическая same-site/cross-site topology. Runtime конфигурация без переменной даёт `[]`, а новый HTTP-тест доказывает `403 {errors:[{message:"Request rejected",extensions:{code:"FORBIDDEN"}}]}` без ACAO. До появления allow-list и schema business endpoint закрыт. Настройка production values/secret injection относится к согласованию окружения, здесь адрес не выдуман.

Точные HTTP(S) origins нового frontend суперadminки пока не подтверждены. Их настройка обязательна до браузерной проверки рабочего входа в карточке 2; текущий запрещающий default `[]` сохранён. Подтверждение существующего REST origin как admin origin тоже должно быть явным. Origin/CORS/CSRF-защита не ослаблялась.

## 5. Тесты и условия приёмки

Файл: `apps/main-gateway-service/test/superadmin/superadmin-infrastructure.spec.ts`.

| Проверка                                   | Доказательство в тесте                                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Context/default/missing verifier; user JWT | context starts null; absent cookie/JWT/null principal/verifier error/missing binding denied         |
| Root и nested guard                        | второй verifier call отвергает nested secret field, root доступен                                   |
| Pagination/DateTime/validation             | defaults 1/8; 1..10000 и 1..50; invalid scalar/DTO bounds                                           |
| Errors/REST                                | safe domain/unexpected/parse/validation mapping; precise REST error envelope; no private markers    |
| Body/transport/batching                    | POST + JSON; >256 KiB → 413; 110 KiB проходит parser; batching → 400                                |
| Depth/complexity                           | depth, alias count 200/201, repeated fragments, runtime variables/default variables/list multiplier |
| Origin/CORS/CSRF                           | absent/unknown origin denied; matching nonce; empty allow-list → 403; credentials/preflight         |
| Runtime/IDE                                | no business fields published; disabled module → 404; production introspection/IDE denied            |
| Query root                                 | actual mutation-only Nest Apollo startup rejected                                                   |

В первоначальном точечном review выполнен изменённый infrastructure suite: **16/16**, ESLint этого test file и targeted TypeScript check с root tsconfig options — passed. Два ранее прошедших JWT/Payment suites повторно не запускались; build production-кода не повторялся. Предыдущий Gateway build и 20/20 в трёх suites относятся к исходной реализации.

После согласования SDL 1.1.0 выполнены только две релевантные проверки из существующего suite: versioned target contract и disabled runtime endpoint — **2 passed, 14 skipped**. Дополнительная read-only проверка GraphQL `buildSchema`/`assertValidSchema`/`validate` подтвердила синтаксис и типы полного SDL, exact non-null session payload с единственным Boolean-полем, версию константы 1.1.0 и корректность query из FE guide. Runtime resolver не добавлялся; будущая session flow не проверялась. Полная сборка/остальные тесты не повторялись, так как runtime-код не менялся.

Осталось для человеческого review:

- Выполнить оставшийся человеческий review target SDL 1.1.0: nullable Profile/Payments, outcomes, pagination/error contract, sort/search rules и pending table columns. Добавление защищённой `superadminSession` уже согласовано пользователем.
- Принять dependency set и явное решение по транзитивному Playground peer warning.
- Реализовать согласованную `superadminSession`, session verifier и login/logout в карточке 2; это будущая работа, не незавершённая runtime-реализация карточки 1.
- Подтвердить exact admin origins и будущий SameSite вариант по размещению; безопасный пустой default уже доказан.
- Подтвердить policy runtime SDL fragments/owners; социальные поля остаются за discovery 7 и реализацией 8, итоговая проверка — 9.
- Проверить diff и принять PR после review. Код реальной session flow/бизнес-карточек этими тестами не проверен.

## 6. git diff --stat (tracked files, снимок первоначального review)

```text
apps/main-gateway-service/src/app.module.ts        |   2 +
 apps/main-gateway-service/src/main.ts              |   8 +
 .../exceptions/global-domain-exception.filter.ts   |   6 +-
 package.json                                       |   6 +
 pnpm-lock.yaml                                     | 728 ++++++++++++++++++++-
 5 files changed, 746 insertions(+), 4 deletions(-)
```

## 7. Новые файлы вне обычного git diff

```text
GRAPHQL_SUPERADMIN_FRONTEND_API.md
apps/main-gateway-service/src/modules/superadmin/api/superadmin-context.ts
apps/main-gateway-service/src/modules/superadmin/api/superadmin-errors.ts
apps/main-gateway-service/src/modules/superadmin/api/superadmin-exception.filter.ts
apps/main-gateway-service/src/modules/superadmin/api/superadmin-http-security.ts
apps/main-gateway-service/src/modules/superadmin/api/superadmin-query-budget.ts
apps/main-gateway-service/src/modules/superadmin/api/superadmin.guard.ts
apps/main-gateway-service/src/modules/superadmin/domain/admin-principal.ts
apps/main-gateway-service/src/modules/superadmin/infrastructure/deny-admin-principal.verifier.ts
apps/main-gateway-service/src/modules/superadmin/superadmin.module.ts
apps/main-gateway-service/test/superadmin/superadmin-infrastructure.spec.ts
libs/common/src/graphql/date-time.scalar.ts
libs/common/src/graphql/pagination-input.ts
libs/contracts/src/graphql/superadmin/v1/common-type-defs.ts
libs/contracts/src/graphql/superadmin/v1/target.graphql
SA_GQL_01_REVIEW.md
```

## 8. Полные запрошенные diffs относительно HEAD (снимок первоначального review)

```diff
diff --git a/apps/main-gateway-service/src/app.module.ts b/apps/main-gateway-service/src/app.module.ts
index 56c8724..afc2332 100644
--- a/apps/main-gateway-service/src/app.module.ts
+++ b/apps/main-gateway-service/src/app.module.ts
@@ -22,10 +22,12 @@ import { NotificationsModule } from './modules/notifications/notifications.modul
 import { NotificationsController } from './modules/notifications/api/notifications.controller';
 import { NotificationLiveEventConsumer } from './modules/notifications/infrastructure/notification-live-event.consumer';
 import { NotificationLiveEventPublisher } from './modules/notifications/infrastructure/notification-live-event.publisher';
+import { SuperadminModule } from './modules/superadmin/superadmin.module';

 @Module({
   imports: [
     CommonModule,
+    SuperadminModule,
     CoreModule,
     GatewayConfigModule,
     ScheduleModule.forRoot(),
diff --git a/apps/main-gateway-service/src/main.ts b/apps/main-gateway-service/src/main.ts
index 41ac38c..6d3d992 100644
--- a/apps/main-gateway-service/src/main.ts
+++ b/apps/main-gateway-service/src/main.ts
@@ -9,6 +9,10 @@ import { MicroserviceOptions, Transport } from '@nestjs/microservices';
 import { INCTAGRAM_USER_V1_PACKAGE_NAME } from '../../../libs/contracts/src';
 import { join } from 'path';
 import { NotificationSocketIoAdapter } from './core/notification-socket-io.adapter';
+import {
+  parseSuperadminOrigins,
+  setupSuperadminHttp,
+} from './modules/superadmin/api/superadmin-http-security';

 const corsAllowedOrigins = [
   'http://localhost:3000',
@@ -54,6 +58,10 @@ async function bootstrap() {
   });

   const gatewayConfig = app.get<GatewayConfig>(GatewayConfig);
+  setupSuperadminHttp({
+    app,
+    policy: { allowedOrigins: parseSuperadminOrigins(process.env.SUPERADMIN_ALLOWED_ORIGINS) },
+  });
   app.useWebSocketAdapter(new NotificationSocketIoAdapter(app, gatewayConfig));

   const grpcOptions: MicroserviceOptions = {
diff --git a/libs/common/src/exceptions/global-domain-exception.filter.ts b/libs/common/src/exceptions/global-domain-exception.filter.ts
index e8d433b..d7007fd 100644
--- a/libs/common/src/exceptions/global-domain-exception.filter.ts
+++ b/libs/common/src/exceptions/global-domain-exception.filter.ts
@@ -14,8 +14,10 @@ import { DomainException, Extension } from './domain-exception';
 export class GlobalDomainExceptionFilter implements ExceptionFilter {
   private readonly logger = new Logger(GlobalDomainExceptionFilter.name);

-  catch(exception: DomainException, host: ArgumentsHost): void {
-    const hostType = host.getType<'http' | 'rpc'>();
+  catch(exception: DomainException, host: ArgumentsHost): unknown {
+    const hostType = host.getType<'http' | 'rpc' | 'graphql'>();
+
+    if (hostType === 'graphql') return exception;

     if (hostType === 'rpc') {
       // Not HTTP context, skip
diff --git a/package.json b/package.json
index 67c9d0c..a43fba0 100644
--- a/package.json
+++ b/package.json
@@ -53,6 +53,8 @@
     "prisma:notification:generate": "cross-env PRISMA_DB_URL=postgresql://127.0.0.1:1/notification_generate_only prisma generate --config apps/micro-notification-service/src/core/prisma/prisma.config.ts"
   },
   "dependencies": {
+    "@apollo/server": "5.5.1",
+    "@as-integrations/express5": "1.1.2",
     "@aws-sdk/client-s3": "^3.1045.0",
     "@aws-sdk/client-sqs": "^3.1045.0",
     "@aws-sdk/s3-presigned-post": "^3.1045.0",
@@ -60,10 +62,12 @@
     "@golevelup/nestjs-rabbitmq": "^9.0.2",
     "@grpc/grpc-js": "^1.14.3",
     "@grpc/proto-loader": "^0.8.0",
+    "@nestjs/apollo": "13.4.5",
     "@nestjs/common": "^11.0.1",
     "@nestjs/config": "^4.0.4",
     "@nestjs/core": "^11.0.1",
     "@nestjs/cqrs": "^11.0.3",
+    "@nestjs/graphql": "13.4.5",
     "@nestjs/jwt": "^11.0.2",
     "@nestjs/microservices": "11.1.19",
     "@nestjs/passport": "^11.0.5",
@@ -85,7 +89,9 @@
     "cookie-parser": "^1.4.7",
     "date-fns": "^4.1.0",
     "dotenv": "^17.4.2",
+    "express": "5.2.1",
     "google-auth-library": "^10.6.2",
+    "graphql": "16.14.2",
     "handlebars": "4.7.9",
     "nestjs-prisma": "^0.27.0",
     "nodemailer": "8.0.6",
```

## 9. SuperadminModule: полное содержимое

```typescript
import { DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled';
import { AdminPrincipalVerifier } from './domain/admin-principal';
import { DenyAdminPrincipalVerifier } from './infrastructure/deny-admin-principal.verifier';
import { SuperadminGuard } from './api/superadmin.guard';
import { createSuperadminContext } from './api/superadmin-context';
import { formatSuperadminError } from './api/superadmin-errors';
import { superadminBudgetPlugin, superadminBudgetRule } from './api/superadmin-query-budget';
import { dateTimeScalar } from '../../../../../libs/common/src/graphql/date-time.scalar';
import { SuperadminExceptionFilter } from './api/superadmin-exception.filter';

@Module({
  providers: [
    { provide: AdminPrincipalVerifier, useClass: DenyAdminPrincipalVerifier },
    { provide: APP_GUARD, useClass: SuperadminGuard },
    { provide: APP_FILTER, useClass: SuperadminExceptionFilter },
  ],
  exports: [AdminPrincipalVerifier],
})
export class SuperadminModule {
  // SA-GQL-02 supplies implemented SDL fragments, resolvers and verifier binding.
  // Import SuperadminModule (without this method) while no business Query root exists.
  static withRuntime(input: { typeDefs: string; production: boolean }): DynamicModule {
    return {
      module: SuperadminModule,
      imports: [
        GraphQLModule.forRoot<ApolloDriverConfig>({
          driver: ApolloDriver,
          typeDefs: input.typeDefs,
          path: '/graphql',
          useGlobalPrefix: true,
          fieldResolverEnhancers: ['guards', 'filters'],
          context: createSuperadminContext,
          resolvers: { DateTime: dateTimeScalar },
          introspection: !input.production,
          playground: false,
          allowBatchedHttpRequests: false,
          includeStacktraceInErrorResponses: false,
          csrfPrevention: true,
          validationRules: [superadminBudgetRule],
          plugins: [ApolloServerPluginLandingPageDisabled(), superadminBudgetPlugin],
          formatError: (formatted, error) => formatSuperadminError({ formatted, error }),
        }),
      ],
    };
  }
}
```

## 10. Verifier port и default registration

Port/default implementation:

```typescript
export type AdminPrincipal = Readonly<{
  sessionId: string;
  role: 'SUPERADMIN';
}>;

export abstract class AdminPrincipalVerifier {
  abstract verify(input: { sessionToken: string | null }): Promise<AdminPrincipal | null>;
}

import { Injectable } from '@nestjs/common';
import { AdminPrincipalVerifier, type AdminPrincipal } from '../domain/admin-principal';

@Injectable()
export class DenyAdminPrincipalVerifier extends AdminPrincipalVerifier {
  verify(input: { sessionToken: string | null }): Promise<AdminPrincipal | null> {
    void input;
    return Promise.resolve(null);
  }
}
```

Регистрация уже показана в module: `{ provide: AdminPrincipalVerifier, useClass: DenyAdminPrincipalVerifier }`. В карточке 2 owner заменяет этот binding в том же module на session verifier, с явным imports/provider для его dependencies. Binding с тем же token в соседнем module сам по себе default не заменит. До замены default ничего не разрешает. Mutation exceptions — metadata, ограниченная точным root login/logout; она не является реализованным login/logout.

Текущий guard проверяет только `superadminSession`, игнорирует обычный bearer JWT и проверяет role/sessionId. Global `APP_GUARD` применяется только к GraphQL; HTTP REST проходит прежний механизм. Field enhancers включены явно и подтверждены nested test.

## 11. История review

- Две узкие проверки: mutation-only Query root rejection и empty origin allow-list HTTP denial.
- Первоначальный review уточнил FE guide об обязательности Query root без изменения целевого SDL/плана.
- Этот review snapshot с полными diff/module/verifier и внешними вопросами.
- Последующее решение пользователя: целевой SDL/версия и FE guide обновлены до 1.1.0 с запланированной защищённой `superadminSession`; в план добавлено короткое согласованное дополнение карточки 2. Runtime-код не менялся.
- Повторная подготовка к приёмке проверила обе фактические install-команды в изолированных временных каталогах, без изменения manifest/lockfile в рабочем дереве. Выбор Query root закрыт решением пользователя; origins остаются неподтверждёнными до браузерной проверки SA-GQL-02.
