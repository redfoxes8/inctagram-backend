# GraphQL суперадминки: Uploaded photos выбранного пользователя

Статус: U1–U4 реализованы и проверены локально; технически готовы к review и одному общему commit/PR. База исследования — локальный `dev`, `a7c4cbf`, runtime contract 1.6.0. Production rollout и browser integration этим документом не подтверждаются.

## Согласованный результат и границы

В деталях выбранного пользователя отображается общая сетка изображений его опубликованных неудалённых постов. Каждая строка PostImage — отдельная плитка: три изображения одного поста занимают три позиции. Порядок: Post.createdAt DESC, Post.id DESC, PostImage.order ASC, PostImage.id ASC. Пагинация и totalCount относятся к изображениям, загрузки всей галереи нет.

Учитываются посты blocked авторов; существующие admin Posts также включают посты deleted/missing авторов. Однако вход в эту вкладку идёт через существующий `superadminUser`: для deleted/missing выбранного User родитель равен null и вложенная галерея не исполняется. Это граница выбранного user-detail API, не изменение общей ленты. Если User удалён конкурентно после чтения parent, единого межсервисного snapshot нет; следующий refetch вернёт null.

Вне scope: unattached uploads, новые файловые операции, просмотрщик, social graph, комментарии/реакции, фоновые задачи, события, subscriptions, новые проекции и env; существующие Profile links, Payments, Followers/Following и общий Posts API сохраняются.

## Что подтверждено кодом

- [Post schema](apps/micro-post-service/prisma/schema.prisma): `Post.id`, `ownerId` — UUID; `createdAt`, `deletedAt`, описание; `PostImage.id`, `postId`, `fileId`, `order`, FK с cascade и unique `(postId,fileId)`. Индексы: Post(ownerId), Post(createdAt), PostImage(postId) плюс уникальный индекс. Составного индекса под всю предлагаемую сортировку нет.
- [CreatePostHandler](apps/micro-post-service/src/modules/posts/application/commands/create-post.handler.ts) проверяет owner и статус File UPLOADED, задаёт порядок из входного массива; [PostCommandRepository](apps/micro-post-service/src/modules/posts/infrastructure/repositories/post.command-repository.ts) коммитит Post, images и опубликованное событие вместе. Отдельного статуса публикации Post нет: сохранённый Post после commit считается опубликованным. Существующий delete физически удаляет Post; фильтр `deletedAt IS NULL` также обязателен для soft-deleted данных.
- [File schema](apps/micro-files-service/src/core/prisma/schema.prisma), [генерация upload URL](apps/micro-files-service/src/modules/files/application/use-cases/generate-url-for-upload.use-case.ts) и [upload completion](apps/micro-files-service/src/modules/files/application/use-cases/file-uploaded.use-case.ts) показывают независимый File lifecycle PENDING → UPLOADED. Загруженный File может существовать без PostImage; галерея берёт только PostImage JOIN Post и потому такой File исключает.
- [GetUserPostsHandler](apps/micro-post-service/src/modules/posts/application/queries/get-user-posts.handler.ts) читает посты по ownerId, но пагинирует посты, не изображения; его fallback и текущую публичную семантику переиспользовать для admin-галереи нельзя. [Общий admin SQL](apps/micro-post-service/src/modules/posts/infrastructure/repositories/superadmin-posts.query-repository.ts) уже задаёт порядок постов и images (`order`, `id`), но получает максимум пять постов и не возвращает PostImage.id. Повторное применение его cursor не даёт photo-level pagination.
- Готовая цепочка: [GraphQL resolver](apps/main-gateway-service/src/modules/superadmin/api/superadmin-posts.resolver.ts) → [Gateway adapter](apps/main-gateway-service/src/modules/superadmin/infrastructure/grpc-superadmin-posts.reader.ts) → [PostGrpcClient](apps/main-gateway-service/src/modules/posts/infrastructure/post-grpc.client.ts) → [Post gRPC controller](apps/micro-post-service/src/modules/posts/api/superadmin-posts-grpc.controller.ts) → Post SQL → [File batch adapter](apps/micro-post-service/src/modules/posts/infrastructure/grpc/superadmin-post-files.adapter.ts) → [File query](apps/micro-files-service/src/modules/files/application/queries/get-files-data.query.ts). Он принимает максимум 50 distinct fileId, валидирует URLs и отображает отсутствующий ключ в null; инфраструктурную ошибку не превращает в пустой успех. Сам [FileGrpcClient](apps/micro-post-service/src/modules/posts/infrastructure/grpc/file-grpc.client.ts) сейчас не задаёт timeout; для новой операции нужен ограниченный вызов, не изменение поведения существующих вызовов. File query не проверяет фактическую доступность S3 и не фильтрует статус/deletedAt: сохранить действующую семантику, не обещать доступность ссылки.
- [Runtime SDL](libs/contracts/src/graphql/superadmin/v1/runtime.graphql), [PageInput/PageInfo](libs/contracts/src/graphql/superadmin/v1/common-type-defs.ts), [nested payments resolver](apps/main-gateway-service/src/modules/superadmin/api/superadmin-payments.resolver.ts), [guard](apps/main-gateway-service/src/modules/superadmin/api/superadmin.guard.ts) и [budget](apps/main-gateway-service/src/modules/superadmin/api/superadmin-query-budget.ts) задают существующие соглашения. [Единый guide](GRAPHQL_SUPERADMIN_FRONTEND_API.md) и [план Posts](GRAPHQL_SUPERADMIN_POSTS_PLAN.md) фиксируют 1.6.0, admin visibility и nullable URL.

## Рекомендуемый контракт

Выбрать nested field: он естественно соответствует вкладке `superadminUser`, использует проверенный parent и аналогичен `payments`/`followers`, не требует второго публичного userId input или дополнительного User lookup. Additive изменение контракта при реализации: 1.6.0 → 1.7.0 по существующей схеме версионирования.

```graphql
extend type SuperadminUser {
  uploadedPhotos(input: PageInput!): SuperadminUserPhotosConnection
}

type SuperadminUserPhoto {
  imageId: ID!
  postId: ID!
  url: String
}

type SuperadminUserPhotosConnection {
  items: [SuperadminUserPhoto!]!
  totalCount: Int!
  pageInfo: PageInfo!
}
```

`imageId` — стабильный `PostImage.id`, не fileId и не индекс позиции: один и тот же fileId теоретически может встречаться в разных постах. `postId` — сохранённый Post.id. `url=null` для отсутствующей File row; описание, дата и username плитке не требуются. `input:{}` даёт page=1/pageSize=8, page 1..10000, pageSize 1..50. Пустая/внешняя страница: items=[], реальный totalCount, pagesCount=ceil(totalCount/pageSize), hasNextPage=false; для нулевого count pagesCount=0. `uploadedPhotos` nullable для ошибок; успешная пустая галерея — объект с нулевым count.

Пример:

```graphql
query UserPhotos($userId: ID!, $input: PageInput!) {
  superadminUser(userId: $userId) {
    userId
    uploadedPhotos(input: $input) {
      items {
        imageId
        postId
        url
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

Стандартный guard проверяет действующую admin cookie session, в том числе nested field/aliases/fragments. Query не требует mutation-CSRF. Невалидный PageInput/ID → BAD_USER_INPUT; отсутствие сессии → UNAUTHENTICATED, policy Origin сохраняется. Outage Post/File, timeout или malformed upstream → nullable `uploadedPhotos=null` с UPSTREAM_UNAVAILABLE и корректным path; неожиданную программную ошибку не маскировать как outage. Parent missing/deleted → `superadminUser=null`, Post RPC не вызывается.

Для показанного полного запроса существующий алгоритм budget считает 33 при pageSize=8 и 159 при pageSize=50: root/connection/items, три поля на item, totalCount и четыре поля pageInfo. Они ниже лимита 200/depth 8; дополнительные поля/aliases суммируются и могут превысить лимит. При реализации проверить фактическим `assertSuperadminBudget` с literal/variables/defaults и убедиться, что множитель items получает `input.pageSize`; глобальный budget не повышать.

## Внутреннее чтение и RPC

Добавить к существующему `PostService` в [post.proto](libs/contracts/src/proto/post.proto) отдельный unary RPC, не меняя имеющиеся номера/методы:

```proto
rpc GetSuperadminUserPhotos(GetSuperadminUserPhotosRequest) returns (GetSuperadminUserPhotosResponse);
message GetSuperadminUserPhotosRequest {
  string user_id = 1;
  optional int32 page = 2;
  optional int32 page_size = 3;
}
message SuperadminUserPhotoView {
  string image_id = 1;
  string post_id = 2;
  optional string url = 3;
}
message GetSuperadminUserPhotosResponse {
  repeated SuperadminUserPhotoView items = 1;
  optional int32 total_count = 2;
  optional int32 page = 3;
  optional int32 page_size = 4;
  optional int32 pages_count = 5;
  optional bool has_next_page = 6;
}
```

Gateway передаёт только id уже полученного parent; Post валидирует UUID и bounds независимо. Optional metadata позволяет отличить ноль/false от отсутствия; валидировать их и согласованность с request, items≤pageSize и UUID/URL до GraphQL mapping. int32/GraphQL Int overflow не обрезать: безопасно завершить ошибкой. Post не обращается к Gateway User DB; отсутствие User отдельно Post RPC не проверяет. No retry, Gateway deadline 5 s через существующий `adminRead`; для File предусмотреть scoped ограниченный timeout короче него, например 3 s, с безопасной ошибкой и освобождением вызова. Общие настройки и существующие File/Post вызовы не менять.

SQL в одном statement и PostgreSQL snapshot: фильтр `p."ownerId" = $userId::uuid AND p."deletedAt" IS NULL`, JOIN `PostImage i ON i."postId"=p."id"`; один filtered CTE по строкам изображений, count всех строк, отдельная страница `ORDER BY p."createdAt" DESC, p."id" DESC, i."order" ASC, i."id" ASC LIMIT $pageSize OFFSET ($page-1)*$pageSize`, LEFT JOIN count и page с sentinel для пустой/внешней страницы. Параметризовать данные; не группировать по Post и не брать LIMIT до JOIN. При неизменных данных tuple обеспечивает стабильные границы даже при одинаковых timestamps/orders. Offset при конкурентных вставке/удалении может сдвинуть страницы и дать повтор/пропуск между запросами; UI при изменениях refetch с первой страницы, для окончательной дедупликации использовать imageId. Это не общий snapshot между страницами.

Внутренний record содержит imageId, postId, fileId; после SQL один File batch для ≤50 distinct IDs и mapping по fileId в исходном порядке, без N+1 и запроса для пустой страницы. Адаптер `SuperadminPostFilesAdapter` подходит по ограничению; `SuperadminPostImagesMapper` привязан к ≤5 постам и массивам, поэтому добавить маленький photo mapper с использованием того же port, не расширяя его до универсального framework. Missing File сохраняет плитку с null URL; File outage не становится null для всех файлов или пустой галереей.

Username projection/readiness не нужна: фильтрация по source ownerId без username; этот RPC не должен зависеть от sync flag/READY общей ленты. Это отдельная query по самим Post/PostImage, не обещание свежести username. Фактические SQL/storage ошибки → безопасный UNAVAILABLE; существующий общий Posts API и его readiness не меняются.

Индексы текущей схемы позволяют найти posts по ownerId и images по postId; для корректности новая миграция не обязательна. Сортировка и глубокий OFFSET могут стоить дорого: на representative disposable данных проверить `EXPLAIN (ANALYZE, BUFFERS)` на умеренном объёме. Дополнительный индекс обсуждать отдельным обоснованным изменением только при измеренной необходимости; заранее миграцию не планировать как обязательную.

## Последовательность реализации

- [x] **U1 — Post read и File batch.** Добавить узкие application types/port и query handler, SQL repository, photo mapper и providers в [Post module](apps/micro-post-service/src/modules/posts/posts.module.ts); переиспользовать `SuperadminPostFiles`. Зависимости: согласование этого плана. Проверить реальную isolated Post DB, одинаковые timestamp/order, три фото на границе страниц, count и удалённый Post; File double проверяет один batch, missing и outage. Готово, когда пагинация идёт по images и count/items получены одним statement.
- [x] **U2 — внутренний RPC.** Добавить указанные сообщения/метод в [post.proto](libs/contracts/src/proto/post.proto), сгенерировать штатным генератором, подключить controller/handler и безопасные ошибки. Зависимость U1. Проверить один реальный Post gRPC, bounds и nullable URL, metadata и File timeout 3 s с управляемым failure; Gateway deadline 5 s подключить и проверить в U3. Готово, когда existing RPC/номера сохранены, новый ответ валидируется.
- [x] **U3 — Gateway и GraphQL.** Добавить read-port/adapter, метод в существующий [PostGrpcClient](apps/main-gateway-service/src/modules/posts/infrastructure/post-grpc.client.ts), nested resolver и module wiring по образцу [Payments](apps/main-gateway-service/src/modules/superadmin/api/superadmin-payments.resolver.ts); добавить feature fragment/runtime composition/target SDL и экспорт runtime 1.7.0. Зависимость U2. Проверить auth, aliases, missing/deleted parent без RPC, blocked parent, invalid input, upstream error и budget 33/159. Готово, когда nullable field использует реальный RPC и существующие guards.
- [x] **U4 — интеграция и документация.** Расширить существующие изолированные helpers одним HTTP GraphQL → Post gRPC → DB сценарием с File double: page boundary, totalCount, URL/null и outage; не дублировать SQL-набор. Дополнить [единый FE guide](GRAPHQL_SUPERADMIN_FRONTEND_API.md) примером, null/error и page reset; сверить фактический runtime SDL и примеры. Зависимость U3. Запустить затронутые тесты, builds/typechecks Gateway/Post, scoped lint/format и `git diff --check`. Готово для review после прохождения проверок; production/browser не объявлять проверенными.

## Открытые для review ограничения

- Offset удобен для totalCount и существующего UI PageInput, но при конкурентных публикациях/удалениях нужны reset/refetch и dedupe, как описано выше. Если требуется стабильный исторический snapshot между страницами, это отдельное решение и расширение scope.
- Изолированный пользовательский detail намеренно недоступен для deleted/missing User, хотя общий admin Posts сохраняет их посты. При необходимости открывать галерею по произвольному missing userId понадобится отдельное продуктовое решение/root API.
- Лимит File batch 50 подтверждён текущим adapter; его внутренний timeout сейчас отсутствует. При реализации проверить возможность отмены scoped вызова и корректную обработку позднего ответа, не заявляя, что один Gateway deadline отменяет Post→File автоматически.

## Результат U1

Post application query, SQL repository и mapper подготовлены без внешнего RPC/GraphQL. Count и photo-level items читаются одним statement; projection/READY не используется. Новый scoped File batch ограничен 3 s, RxJS timeout отменяет подписку; прежний File-вызов без этого timeout сохранён. Missing File даёт null URL, storage/File outage — безопасную ошибку. Миграция не потребовалась.

Проверки: `superadmin-user-photos.integration-spec.ts` — 3/3 на disposable PostgreSQL, File transport double (включая отмену таймаута); целевой существующий D3 File batch test — 1/1. На 1000 постов и 3000 изображений `EXPLAIN (ANALYZE, BUFFERS)`, pageSize 50 / offset 1000: 5.002 ms, 3033 shared hits; использован существующий индекс PostImage, недостаточно оснований добавлять индекс. Это локальное измерение, не production benchmark. Post build, source/test typecheck, scoped ESLint/Prettier и `git diff --check` — успешно. Предыдущая схема disposable DB подготовлена helper через SQL/baseline; это не доказательство чистого применения всей migration history. U2–U4 остаются открытыми.

## Результат U2

Добавлен `PostService.GetSuperadminUserPhotos`: optional page/pageSize по умолчанию 1/8, явные 0 и выход за пределы отклоняются query U1; absent URL остаётся optional, metadata присутствуют и при false/0. Использован существующий безопасный gRPC interceptor. Generated `post.ts` обновлён командой `pnpm run gen:contracts` и форматирован Prettier; несвязанные результаты генератора восстановлены.

`superadmin-user-photos-grpc.integration-spec.ts` — 1/1: настоящий локальный Nest gRPC и disposable Post PostgreSQL, File transport double; успешная страница, nullable URL, default и invalid input, outage и 3-секундный timeout с отменой. Тестовая схема подготовлена существующим SQL/baseline helper, без shared/production. Post build, source/test typecheck и scoped ESLint/Prettier — успешно. Gateway 5 s deadline, публичный GraphQL и U3/U4 не реализованы.

## Результат U3

Добавлен отдельный Gateway photos module и nested `SuperadminUser.uploadedPhotos(input: PageInput!)`, Post RPC использует существующий channel и ограничение 5 s без retry. Parent userId берётся из уже разрешённых деталей; response проверяется на полноту metadata, согласованность count/page/items, UUID и URL до mapping. U1/U2, существующие Payments/Posts и session policy не менялись. Runtime/target SDL и версия обновлены до 1.7.0.

`superadmin-user-photos.integration-spec.ts` — 4/4: реальный GraphQL HTTP/isolated Gateway PostgreSQL с Post transport double, auth, deleted/missing, blocked, validation, malformed/outage с alias path, safe unexpected error и schema export; отдельная проверка виртуального времени подтверждает timeout 5 s/cancel/no retry. Фактический budget: 33 при default 8, 159 при literal/variable 50, aliases суммируются и превышение 200 отклоняется. Gateway build, source/test typecheck, scoped ESLint/Prettier и `git diff --check` — успешно. Это не U4: реальный GraphQL → Post gRPC → Post DB и обновление FE guide ещё предстоят.

## Результат U4 и deployment

Связный `superadmin-user-photos.integration-spec.ts` с фильтром `U4 connected` — 2/2: настоящий GraphQL HTTP → Post gRPC → disposable Post PostgreSQL, отдельная disposable Gateway PostgreSQL. File transport заменён точечным double. Проверены данные выбранного автора, граница внутри поста, порядок, count/pageInfo, deleted Post, missing File и безопасный outage; все исполняемые GraphQL-примеры единого guide валидны против фактической Nest schema, runtime SDL совпадает. Изменённый test typecheck, Gateway/Post builds и source typechecks, scoped ESLint/Prettier и `git diff --check` — успешно.

В итоговом diff нет новых migrations, env, deployment или dependencies. При rollout сначала собрать и развернуть Post MS с новым RPC, дождаться его готовности, затем собрать и развернуть Gateway с GraphQL 1.7.0. Проверить существующие внутренние Post/File gRPC подключения и выполнить согласованный smoke с тестовым пользователем. До обновления Post запрос из нового Gateway может вернуть `UPSTREAM_UNAVAILABLE`; смешанные Gateway версии в rollout дают разные схемы. Production rollout, сеть, S3 URL и browser integration локальным тестом не подтверждены.

Для review: offset pagination при конкурентных изменениях может сдвигаться; FE сбрасывает цепочку и refetch с первой страницы. Deleted/missing User остаётся null detail. Полная история миграций не переигрывалась как чистый deploy: изолированные helpers готовят предыдущую схему с baseline.
