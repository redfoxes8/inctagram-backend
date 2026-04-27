# Testing Welcome

Этот файл нужен как краткая инструкция для команды по новой тестовой инфраструктуре.

## Что было добавлено

В проекте появились 3 ключевых элемента:

1. `libs/common/src/testing/reset-db.ts`
2. `apps/<service>/test/jest.env-setup.ts`
3. `apps/<service>/test/jest.config.ts`

Они решают 4 задачи:

1. Загружают правильный `.env.test` до старта Nest/Prisma.
2. Изолируют тесты по Postgres schema.
3. Автоматически применяют Prisma migrations для тестовой schema.
4. Чистят таблицы между прогонами без ручной подготовки БД.

---

## Как это работает

### `jest.env-setup.ts`

Этот файл выполняется раньше импорта модулей приложения.

Что он делает:

1. Устанавливает `NODE_ENV=test`.
2. Подставляет `ENV_FILE_PATH` на `.env.test`.
3. Подставляет `PRISMA_CONFIG_PATH` на нужный `prisma.config.ts`.
4. Создаёт `TEST_DB_SCHEMA` в формате `test_<workerId>`.
5. Добавляет `schema=<TEST_DB_SCHEMA>` в `PRISMA_DB_URL`.

Итог: каждый тестовый запуск работает не в `public`, а в своей отдельной schema.

---

### `reset-db.ts`

Это общая утилита для подготовки тестовой БД.

Что делает `resetDb()`:

1. Загружает env, если они ещё не загружены.
2. Подключается к Postgres.
3. Создаёт test schema, если её ещё нет.
4. Один раз на schema прогоняет `prisma migrate deploy`.
5. Если schema сломана из-за failed migration, пересоздаёт её и применяет миграции заново.
6. После этого делает `TRUNCATE ... RESTART IDENTITY CASCADE` по всем таблицам schema.

Важно:

1. `resetDb()` нельзя использовать против `public` для пересоздания schema.
2. Утилита использует `.jest-prisma-migrate.lock`, чтобы migrations не запускались одновременно.
3. Протухший lock теперь чистится автоматически.

---

### `jest.config.ts`

Для `main-gateway-service` конфиг сейчас такой:

1. Подключает `setupFiles: ['./jest.env-setup.ts']`
2. Использует `ts-jest`
3. Ограничивает `maxWorkers: 1`

Почему `maxWorkers: 1`:

1. E2E тесты поднимают Nest и Prisma.
2. Они используют общую тестовую БД и migrations.
3. Параллельный запуск давал конфликты по lock и schema preparation.

Для unit/integration на моках это не критично, но для текущих e2e это безопасный режим.

---

## Как писать тесты сейчас

### E2E тест

Для e2e теста используем реальный `AppModule`, `request`, `resetDb()` и `beforeAll`.

Шаблон:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { resetDb } from '../../../../libs/common/src/testing/reset-db';
import { GlobalDomainExceptionFilter } from '../../../../libs/common/src/exceptions/global-domain-exception.filter';

describe('Feature API (e2e)', () => {
  let app: INestApplication<App>;
  jest.setTimeout(180000);

  beforeAll(async () => {
    await resetDb();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new GlobalDomainExceptionFilter());

    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('should work', async () => {
    await request(app.getHttpServer()).get('/some-route').expect(200);
  });
});
```

Правила:

1. `resetDb()` вызывать в верхнем `beforeAll()` файла.
2. `app.close()` всегда делать в `afterAll()`.
3. Для e2e не создавать свою ручную логику очистки таблиц.
4. Если тест тяжёлый, ставить `jest.setTimeout(...)` на уровне `describe`, а не внутри hook.

---

### Integration тест

Если это integration/controller-level тест с моками, БД там не нужна.

Шаблон:

```ts
describe('Feature integration', () => {
  let controller: SomeController;
  let commandBus: CommandBus;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [SomeController],
      providers: [
        {
          provide: CommandBus,
          useValue: {
            execute: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(SomeController);
    commandBus = module.get(CommandBus);
  });
});
```

Правила:

1. Для тестов на моках не вызывать `resetDb()`.
2. Использовать `beforeEach`, чтобы моки не текли между тестами.
3. Если проверяется количество вызовов, лучше проверять `spy`, а не оторванный метод.

Пример:

```ts
const executeSpy = jest.spyOn(commandBus, 'execute').mockResolvedValue(undefined);
expect(executeSpy).toHaveBeenCalledTimes(1);
```

---

## Как добавить тесты в новый микросервис

Если в новом сервисе тоже есть Prisma/Postgres и нужны e2e/integration тесты, делаем так.

### 1. Создать папку `test`

Пример:

```text
apps/micro-some-service/test/
```

Там должны лежать:

1. `jest.config.ts`
2. `jest.env-setup.ts`
3. `*.e2e-spec.ts`
4. `*.integration-spec.ts`

---

### 2. Создать `jest.env-setup.ts`

Нужно адаптировать только пути:

```ts
import path from 'path';
import dotenv from 'dotenv';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';

if (!process.env.ENV_FILE_PATH) {
  process.env.ENV_FILE_PATH = path.resolve(__dirname, '../.env.test');
}

if (!process.env.PRISMA_CONFIG_PATH) {
  process.env.PRISMA_CONFIG_PATH = path.resolve(__dirname, '../src/core/prisma/prisma.config.ts');
}

if (!process.env.TEST_DB_SCHEMA) {
  const workerId = process.env.JEST_WORKER_ID ?? '0';
  process.env.TEST_DB_SCHEMA = `test_${workerId}`;
}

dotenv.config({ path: process.env.ENV_FILE_PATH });

if (process.env.PRISMA_DB_URL) {
  const u = new URL(process.env.PRISMA_DB_URL);
  u.searchParams.set('schema', process.env.TEST_DB_SCHEMA);
  process.env.PRISMA_DB_URL = u.toString();
}

if (process.env.PRISMA_DB_DIRECT_URL) {
  const u = new URL(process.env.PRISMA_DB_DIRECT_URL);
  u.searchParams.set('schema', process.env.TEST_DB_SCHEMA);
  process.env.PRISMA_DB_DIRECT_URL = u.toString();
}
```

---

### 3. Создать `jest.config.ts`

Шаблон:

```ts
import { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  maxWorkers: 1,
  setupFiles: ['./jest.env-setup.ts'],
  testEnvironment: 'node',
  testRegex: ['\\.(spec|integration-spec|e2e-spec)\\.ts$'],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
};

export default config;
```

Если сервис вообще не использует БД, `maxWorkers: 1` не обязателен.

---

### 4. Убедиться, что у сервиса есть `.env.test`

Минимально:

1. `PRISMA_DB_URL`
2. `PRISMA_DB_DIRECT_URL`, если нужен direct connection
3. Все обязательные env сервиса

---

### 5. Подключить project в корневой `jest.config.ts`

Добавить путь в `projects`:

```ts
projects: [
  '<rootDir>/apps/main-gateway-service/test/jest.config.ts',
  '<rootDir>/apps/micro-some-service/test/jest.config.ts',
];
```

---

## Когда вызывать `resetDb()`

Вызывать:

1. В e2e файлах перед поднятием приложения.
2. В настоящих DB integration тестах, где реально используется Prisma/Postgres.

Не вызывать:

1. В unit тестах.
2. В integration тестах на моках.
3. В controller tests, где нет реального доступа к БД.

---

## Частые ошибки

### `Timed out waiting for lock file`

Причина:

1. остался старый `.jest-prisma-migrate.lock`
2. одновременно стартуют несколько тяжёлых DB suite

Что делать:

1. убедиться, что `maxWorkers: 1`
2. повторить прогон
3. при необходимости удалить `.jest-prisma-migrate.lock`

---

### `P3009 migrate found failed migrations`

Причина:

1. тестовая schema уже сломана из-за прошлой неудачной миграции

Что происходит сейчас:

1. `resetDb()` автоматически пересоздаёт test schema и прогоняет миграции заново

---

### `Cannot read properties of undefined (reading 'getHttpServer')`

Причина:

1. упал верхний `beforeAll()`
2. приложение не было поднято

Смотреть нужно не на `getHttpServer`, а на первую ошибку выше в логе.

---

## Краткое правило для команды

1. E2E с реальной БД: `resetDb()` + `AppModule` + `beforeAll`.
2. Integration на моках: без `resetDb()`, через `beforeEach`.
3. Новый микросервис: копируем `jest.env-setup.ts` и `jest.config.ts`, меняем только пути.
4. Если сервис использует Prisma, тесты должны идти через отдельную test schema, не через `public`.
