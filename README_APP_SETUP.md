# README_APP_SETUP

Этот документ описывает единый паттерн запуска приложений в монорепозитории Inctagram: `Smart App Setup`.

Его цель:
- убрать дублирование из `main.ts`;
- синхронизировать поведение `main-gateway-service` и `micro-files-service`;
- сделать конфигурацию предсказуемой для локальной разработки, Docker и Kubernetes;
- сохранить возможность расширения без переписывания bootstrap-логики в каждом сервисе.

---

## 1. Концепция `Smart App Setup`

### Зачем мы вынесли всё из `main.ts`

Раньше `main.ts` обычно превращается в набор ручных вызовов:
- `setGlobalPrefix(...)`
- `enableCors(...)`
- `useGlobalPipes(...)`
- `useGlobalFilters(...)`
- `SwaggerModule.setup(...)`
- ручное чтение `process.env`

Проблема в том, что такой код:
- быстро расходится между сервисами;
- тяжело поддерживается;
- плохо масштабируется, когда появляется второй или третий микросервис;
- делает поведение приложения зависимым от конкретного файла `main.ts`.

`appSetup` решает это следующим образом:
- переносит общие инфраструктурные решения в `libs/common`;
- делает их параметризуемыми через `AppSetupOptions`;
- позволяет каждому сервису включать только нужные слои;
- сохраняет единый стандарт запуска для всей экосистемы.

### Что мы получаем

- Синхронизация настроек между `main-gateway-service` и `micro-files-service`.
- Меньше дублирования.
- Более предсказуемое поведение при старте.
- Проще добавлять новый сервис.
- Проще тестировать и ревьюить bootstrap.

---

## 2. Архитектурные принципы и паттерны

Этот раздел фиксирует два правила, которые считаются золотым стандартом проекта.

### 2.1 RPC-First

Текущая архитектура микросервисов строится по принципу `RPC-first`.

Это означает:

- внешний мир общается с системой через `main-gateway-service` по HTTP;
- внутри системы все командные и data-запросы между микросервисами должны идти через высокопроизводительные внутренние каналы;
- для внутренних коммуникаций приоритет отдается TCP/gRPC, а не HTTP-прокси;
- HTTP внутри микросервисов используется только там, где это действительно оправдано контрактом сервиса.

#### Почему так

- HTTP на gateway нужен для удобства внешних клиентов, фронтенда и публичного API.
- RPC внутри кластера дает более компактный и быстрый транспорт для service-to-service взаимодействия.
- Такой подход снижает связанность сервисов по HTTP-контрактам и делает доменную коммуникацию более явной.

#### Ментальная модель

```text
Client -> Gateway (HTTP) -> internal RPC -> microservice
```

Для разработчика это означает простое правило:

- если запрос идет снаружи, он приходит в gateway;
- если запрос идет между микросервисами, он не должен превращаться в лишний HTTP hop без необходимости.

### 2.2 Direct Connection для тяжелого контента

Передача больших файлов, например видео размером 1 Гб, не должна проходить через `main-gateway-service`.

Для таких сценариев используется паттерн:

- `Redirect`
- `Presigned URL`
- `Direct Upload`

#### Проблема

Если проксировать большой файл через gateway:

- растет нагрузка на шлюз;
- увеличивается latency;
- усложняется memory pressure;
- gateway превращается в узкое место для бинарного трафика.

#### Решение

1. Клиент обращается в `main-gateway-service`.
2. Gateway проверяет права и бизнес-ограничения.
3. Gateway возвращает:
   - либо `HTTP 307 Redirect`,
   - либо временную ссылку на загрузку,
   - либо контракт для direct upload.
4. Клиент загружает файл напрямую в `micro-files-service` по HTTP.
5. `micro-files-service` уже обрабатывает тяжелый контент локально, не перегружая gateway.

#### Почему это хорошо сочетается с текущей архитектурой

- `main-gateway-service` остается легким маршрутизатором и auth-entrypoint.
- `micro-files-service` может работать в гибридном режиме благодаря `appSetup`.
- файловый сервис готов принимать HTTP-трафик для стриминга и upload-сценариев, не смешивая это с внутренними RPC-командами.

#### Текстовая схема потока

```text
Client
  |
  | 1. request file upload
  v
main-gateway-service
  |
  | 2. auth + permission check
  |
  | 3. returns 307 Redirect or presigned URL
  v
Client
  |
  | 4. direct HTTP upload
  v
micro-files-service
  |
  | 5. store / process file
  v
Storage / Object Store
```

#### Архитектурное правило

Любой новый поток с тяжелыми бинарными данными должен по умолчанию оцениваться через призму `Direct Connection`, а не через проксирование через gateway.

---

## 3. Базовая идея архитектуры

`appSetup` работает как универсальный конструктор инфраструктуры:

1. Создает единый глобальный pipeline валидации.
2. Настраивает `useContainer(...)`, чтобы `class-validator` мог использовать DI.
3. Подключает глобальный доменный фильтр ошибок.
4. Опционально включает HTTP-слой.
5. Опционально оставляет задел под RPC-слой.

Идея простая:
- бизнес-логика живет в модулях;
- инфраструктура живет в `libs/common`;
- `main.ts` остается тонким и декларативным.

---

## 4. `AppSetupOptions`

Файл: `libs/common/src/setup/app-setup-options.ts`

```ts
export type AppSetupOptions = {
  httpConfig?: HttpSetupConfig;
  rpcConfig?: RpcSetupConfig;
  validationCustomConfig?: ValidationPipeOptions;
};
```

### 3.1 `httpConfig`

Используется, когда приложение работает как HTTP-сервис.

Поддерживаемые флаги:

- `enabled`  
  Включает или выключает HTTP-слой как таковой.

- `enableGlobalPrefix`  
  Управляет установкой глобального префикса, например `api`.

- `enableCors`  
  Включает CORS.

- `corsOptions`  
  Позволяет передать настройки CORS.

- `enableCookies`  
  Подключает cookie-parser middleware.

- `enableSwagger`  
  Включает Swagger UI.

- `globalPrefix`  
  Явное имя префикса маршрутов.

- `swagger`  
  Настройки Swagger: title, description, version, path.

### 3.2 `rpcConfig`

Используется для сервисов, которые будут работать в RPC-режиме или в hybrid-режиме.

Поддерживаемые флаги:

- `enabled`  
  Включает RPC-слой как логический режим приложения.

- `tcpPipes`  
  Задел под TCP-специфичные пайпы.

- `grpcPipes`  
  Задел под gRPC-специфичные пайпы.

На текущем этапе это расширяемый hook. Он нужен, чтобы инфраструктурный код уже был готов к дальнейшему включению транспортных сценариев без переписывания bootstrap.

### 3.3 `validationCustomConfig`

Позволяет расширить базовый `ValidationPipe`.

Это полезно, когда сервису нужно:
- переопределить поведение валидации;
- добавить собственный `exceptionFactory`;
- изменить настройки трансформации;
- расширить глобальную валидацию без копирования `ValidationPipe` в каждом `main.ts`.

---

## 5. Пример включения гибридного режима

Для файлового сервиса можно включить HTTP + RPC в одной конфигурации:

```ts
appSetup(app, AppModule, {
  httpConfig: {
    enabled: true,
    enableGlobalPrefix: true,
    enableCors: true,
    enableCookies: true,
    enableSwagger: true,
    globalPrefix: 'api',
    swagger: {
      title: 'Files API',
      description: 'micro-files-service',
      version: '1.0.0',
    },
  },
  rpcConfig: {
    enabled: true,
    tcpPipes: true,
    grpcPipes: true,
  },
});
```

Если нужен только RPC-режим, можно оставить `httpConfig.enabled = false`, а HTTP-слой включить позже без изменения общей bootstrap-архитектуры.

---

## 6. Секретное оружие: DI в DTO через `useContainer`

Файл: `libs/common/src/setup/app-setup.ts`

Ключевая строка:

```ts
useContainer(app.select(appModule), { fallbackOnErrors: true });
```

### Что это дает

Теперь `class-validator` может получать зависимости через Nest DI.

Это особенно важно для кастомных валидаторов:
- проверка уникальности email;
- проверка существования пользователя;
- проверка доступности ресурса;
- проверка бизнес-ограничений через репозиторий или сервис.

### Почему это работает

`app.select(appModule)` передает `class-validator` доступ к контейнеру конкретного модуля приложения.

`fallbackOnErrors: true` означает:
- если валидатор можно создать через DI, он будет создан через DI;
- если нет, `class-validator` попробует обычный путь создания.

Это убирает костыли с ручным `new Validator(...)` внутри DTO и делает валидацию нормальной частью архитектуры.

### Пример: `@IsUserAlreadyExists`

```ts
import { Injectable } from '@nestjs/common';
import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@Injectable()
@ValidatorConstraint({ async: true })
export class IsUserAlreadyExistsConstraint
  implements ValidatorConstraintInterface
{
  constructor(private readonly usersRepository: UsersRepository) {}

  async validate(email: string): Promise<boolean> {
    const user = await this.usersRepository.findByEmail(email);
    return !user;
  }

  defaultMessage(args: ValidationArguments): string {
    return `User with email "${args.value}" already exists`;
  }
}

export function IsUserAlreadyExists(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (object: object, propertyName: string | symbol): void => {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName.toString(),
      options: validationOptions,
      validator: IsUserAlreadyExistsConstraint,
    });
  };
}
```

### Почему это полезно

- Валидация становится доменно-осознанной.
- DTO не содержит ручной логики.
- Репозитории и сервисы используются через DI.
- Код легче тестировать и переиспользовать.

---

## 7. Магия фильтрации: `GlobalDomainExceptionFilter`

Файл: `libs/common/src/exceptions/global-domain-exception.filter.ts`

### Идея фильтра

Один и тот же `DomainException` должен корректно работать в разных транспортных контекстах:
- в HTTP он должен превращаться в HTTP-ответ;
- в RPC он должен пробрасываться как `RpcException`.

### Как фильтр определяет контекст

Он использует:

```ts
host.getType<'http' | 'rpc'>()
```

Логика:
- если контекст `http`, маппим в `HttpException`;
- если контекст `rpc`, маппим в `RpcException`.

### Что увидит фронтенд

Если в домене выброшен:

```ts
throw new DomainException({
  code: DomainExceptionCode.ValidationError,
  message: 'Validation failed',
  extensions: [
    { field: 'email', message: 'email must be an email' },
  ],
});
```

То HTTP-клиент получит ответ вида:

```json
{
  "errorsMessages": [
    {
      "field": "email",
      "message": "email must be an email"
    }
  ]
}
```

И статус `400 Bad Request`.

### Что получит gateway через TCP / RPC

Тот же `DomainException` в RPC-контексте будет проброшен как `RpcException` с payload:

```json
{
  "code": 400,
  "message": "Validation failed",
  "extensions": [
    {
      "field": "email",
      "message": "email must be an email"
    }
  ]
}
```

Это важно для микросервисов:
- ошибка не теряется;
- транспорт не подменяет смысл доменной ошибки;
- gateway и worker говорят на одном языке.

---

## 8. Консистентная валидация

Файлы:
- `libs/common/src/setup/validation-error.formatter.ts`
- `libs/common/src/setup/validation-pipe-options.ts`

### Что делает formatter

`formatValidationErrors(...)` берет тяжёлую структуру `ValidationError[]` и превращает ее в простой массив:

```ts
type Extension = {
  field: string;
  message: string;
};
```

То есть из большого вложенного объекта мы получаем чистый и понятный список ошибок.

### Почему это полезно

- фронтенду легче отображать ошибки;
- ответ становится единообразным;
- сложные вложенные DTO не превращают ответ в нечитаемый JSON;
- валидация остается стабильной и предсказуемой.

### Базовые настройки ValidationPipe

Общая конфигурация вынесена в `BASE_VALIDATION_PIPE_OPTIONS`:

- `transform: true`
- `whitelist: true`
- `stopAtFirstError: true`
- `exceptionFactory`

Это значит:
- DTO трансформируются в экземпляры классов;
- лишние поля вырезаются;
- на первом нарушении правила поле падает быстро;
- ошибки конвертируются в `DomainException`.

### Пример структуры ответа при ошибке валидации

```json
{
  "errorsMessages": [
    {
      "field": "port",
      "message": "port must be a number conforming to the specified constraints"
    },
    {
      "field": "includeTestingModule",
      "message": "includeTestingModule must be a boolean value"
    }
  ]
}
```

---

## 9. Quick Start

### 8.1 Как подключить новый HTTP-сервис

```ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { initAppModule } from './init-app-module';
import { appSetup, GLOBAL_PREFIX } from '@inctagram/common';

async function bootstrap(): Promise<void> {
  const dynamicModule = await initAppModule();
  const app = await NestFactory.create(dynamicModule);

  appSetup(app, AppModule, {
    httpConfig: {
      enabled: true,
      enableGlobalPrefix: true,
      enableCors: true,
      enableCookies: true,
      enableSwagger: true,
      globalPrefix: GLOBAL_PREFIX,
      swagger: {
        title: 'Service API',
        description: 'service description',
        version: '1.0.0',
      },
    },
  });

  await app.listen(3000);
}

bootstrap();
```

### 8.2 Как подключить новый RPC-воркер

```ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { initAppModule } from './init-app-module';
import { appSetup } from '@inctagram/common';

async function bootstrap(): Promise<void> {
  const dynamicModule = await initAppModule();
  const app = await NestFactory.create(dynamicModule);

  appSetup(app, AppModule, {
    httpConfig: {
      enabled: false,
      enableGlobalPrefix: false,
      enableCors: false,
      enableCookies: false,
      enableSwagger: false,
    },
    rpcConfig: {
      enabled: true,
      tcpPipes: true,
      grpcPipes: true,
    },
  });

  // RPC transport bootstrap goes here.
}

bootstrap();
```

### 8.3 Как подключить hybrid-сервис

Если сервис одновременно:
- принимает команды по gRPC/TCP;
- отдает HTTP-стриминг или healthcheck;

то достаточно включить оба блока:

```ts
appSetup(app, AppModule, {
  httpConfig: {
    enabled: true,
    enableGlobalPrefix: true,
    enableCors: true,
    enableSwagger: false,
  },
  rpcConfig: {
    enabled: true,
    tcpPipes: true,
    grpcPipes: true,
  },
});
```

---

## 10. Куда расширять систему

Если в будущем появятся новые глобальные инфраструктурные блоки, их лучше добавлять в `libs/common/src/setup`.

### Примеры:

- `SentryInterceptor`
  - отдельный файл в `libs/common/src/setup`
  - подключение через новый флаг в `AppSetupOptions`

- `CompressionMiddleware`
  - тоже в `libs/common/src/setup`
  - включается через HTTP-конфиг

- `TracingInterceptor`
  - в `libs/common/src/setup`
  - может быть включен и для HTTP, и для RPC

### Рекомендация по расширению

Если новый блок:
- касается всех сервисов;
- должен вести себя одинаково;
- зависит только от инфраструктуры;

то он должен жить в `libs/common`.

Если блок относится только к одному сервису, он должен остаться в `apps/<service>/src`.

---

## 11. Практические правила для новой микросервисной экосистемы

- `main.ts` должен быть тонким.
- Все общие bootstrap-решения должны жить в `libs/common`.
- `DomainException` должен быть общим и транспорт-нейтральным.
- Валидация должна быть единообразной.
- HTTP и RPC должны подключаться декларативно через `AppSetupOptions`.
- Новый сервис должен стартовать по тому же шаблону, что и gateway/files.

---

## 12. Итог

`Smart App Setup` делает монорепозиторий:
- более предсказуемым;
- более расширяемым;
- легче поддерживаемым;
- готовым к росту числа сервисов и транспортов.

Если коротко:
- `main.ts` больше не содержит архитектуру;
- архитектура живет в `libs/common`;
- сервисы только объявляют, что именно им нужно включить.
