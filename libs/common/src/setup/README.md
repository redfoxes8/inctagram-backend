# `libs/common/src/setup`

Этот документ предназначен для разработчиков, которые поддерживают или изменяют саму библиотеку `common`.

Если вам нужны только примеры запуска сервисов и базовый onboarding, см. корневой документ:

- [README_APP_SETUP.md](../../../../README_APP_SETUP.md)

---

## 1. Роль слоя `setup`

Папка `libs/common/src/setup` содержит инфраструктурный bootstrap-слой, который отвечает за:

- сборку глобальной конфигурации приложения;
- установку общих NestJS-пайпов и фильтров;
- подключение DI к `class-validator`;
- унификацию HTTP- и RPC-поведения;
- поддержку расширяемой модели запуска для разных сервисов.

Идея очень простая:

- `apps/*/src/main.ts` должен быть тонким;
- `libs/common/src/setup/*` должен содержать всю повторяемую стартовую инфраструктуру;
- новые сервисы должны подключаться через декларативные опции, а не через копипасту.

---

## 2. Внутренний lifecycle `appSetup`

Файл: [`app-setup.ts`](./app-setup.ts)

Функция `appSetup(app, appModule, options)` выполняет несколько шагов в фиксированном порядке.

### Порядок вызовов

1. `useContainer(app.select(appModule), { fallbackOnErrors: true })`
2. `app.useGlobalPipes(new ValidationPipe(createValidationPipeOptions(...)))`
3. `app.useGlobalFilters(new GlobalDomainExceptionFilter())`
4. Если включен `httpConfig`, настраивается HTTP-слой:
   - global prefix
   - CORS
   - cookie parser
   - Swagger
5. Если включен `rpcConfig`, оставляется hook под RPC-специфичные пайпы

### Почему порядок важен

- сначала регистрируется DI-контейнер для валидаторов;
- потом подключается глобальная валидация;
- потом подключается фильтр исключений;
- только после этого включаются транспортные расширения.

Если поменять порядок, можно получить неочевидные эффекты:

- кастомные валидаторы не увидят провайдеры;
- ошибки валидации будут форматироваться не тем фильтром;
- часть инфраструктуры окажется активной только для части запросов.

---

## 3. Поток запроса через `GlobalDomainExceptionFilter`

Файл: [`global-domain-exception.filter.ts`](./../exceptions/global-domain-exception.filter.ts)

Фильтр — это центральный адаптер между доменной ошибкой и транспортом.

### Логика высокого уровня

- `DomainException` выбрасывается в домене или application layer;
- фильтр ловит его на уровне Nest;
- дальше фильтр смотрит на `ArgumentsHost.getType()`;
- если это `http`, ошибка маппится в HTTP-ответ;
- если это `rpc`, ошибка маппится в `RpcException`.

### Текстовая схема

```text
Domain layer / Application use case
        |
        | throw new DomainException(...)
        v
GlobalDomainExceptionFilter.catch(...)
        |
        +--> host.getType() === 'http'
        |        |
        |        +--> map to HttpException
        |        +--> build HTTP response body
        |        +--> response.status(...).json(...)
        |
        +--> host.getType() === 'rpc'
                 |
                 +--> map to RpcException
                 +--> return throwError(() => RpcException)
```

### Mermaid

```mermaid
flowchart TD
  A[DomainException thrown] --> B[GlobalDomainExceptionFilter.catch]
  B --> C{ArgumentsHost.getType()}
  C -->|http| D[Map to HttpException]
  D --> E[Format HTTP response]
  E --> F[Send JSON / status]
  C -->|rpc| G[Map to RpcException]
  G --> H[throwError(() => RpcException)]
```

---

## 4. Dependency Injection в DTO и валидаторах

### Что делает `useContainer(app.select(AppModule), { fallbackOnErrors: true })`

Эта строка говорит `class-validator`, что создавать constraint-классы нужно через Nest DI-контейнер основного приложения.

```ts
useContainer(app.select(appModule), { fallbackOnErrors: true });
```

### Почему используется `app.select(AppModule)`

`app.select(AppModule)` ограничивает область видимости контейнера до конкретного модуля приложения, а не до случайного внешнего контекста.

Это важно, потому что:

- валидаторы должны видеть провайдеры, зарегистрированные в этом приложении;
- библиотека `common` не должна жестко зависеть от конкретного сервиса;
- один и тот же helper должен работать и в gateway, и в micro-files, и в будущем в других микросервисах.

### Что дает `fallbackOnErrors: true`

Если `class-validator` не сможет построить некоторый объект через DI, он попробует fallback-путь.

Это полезно для:

- безопасной деградации;
- постепенного внедрения DI-валидации;
- совместимости с legacy-валидами.

### Почему это важно для `common`

Потому что библиотека должна оставаться универсальной:

- она не знает заранее, какие именно репозитории есть в конкретном сервисе;
- она только подключает мост между Nest-контейнером и `class-validator`.

---

## 5. Пример кастомного валидатора `@IsUniqueConstraint`

Ниже показан типичный паттерн, который начинает работать только после вызова `useContainer(...)`.

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
export class IsUniqueConstraintConstraint implements ValidatorConstraintInterface {
  constructor(private readonly usersRepository: UsersRepository) {}

  async validate(value: string): Promise<boolean> {
    const existingUser = await this.usersRepository.findByEmail(value);
    return !existingUser;
  }

  defaultMessage(args: ValidationArguments): string {
    return `Value "${args.value}" must be unique`;
  }
}

export function IsUniqueConstraint(validationOptions?: ValidationOptions): PropertyDecorator {
  return (object: object, propertyName: string | symbol): void => {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName.toString(),
      options: validationOptions,
      validator: IsUniqueConstraintConstraint,
    });
  };
}
```

### Что здесь принципиально

- `@ValidatorConstraint({ async: true })` делает constraint асинхронным;
- `UsersRepository` инжектится в конструктор;
- `registerDecorator(...)` связывает декоратор с constraint-классом;
- `useContainer(...)` позволяет `class-validator` попросить Nest построить constraint через DI.

### Почему это работает без костылей

Потому что:

1. DTO остается DTO;
2. бизнес-проверка остается в валидаторе;
3. `class-validator` получает контейнер;
4. репозиторий берется из стандартного Nest-провайдера;
5. никакого ручного `new UsersRepository()` не требуется.

---

## 6. Exception Mapping Logic

Фильтр маппит `DomainException` по двум осям:

- транспорт: HTTP или RPC;
- семантика кода: `DomainExceptionCode`.

### HTTP mapping

В HTTP-контексте:

- `ValidationError` и `BadRequest` дают `400`;
- `NotFound` дает `404`;
- `Forbidden` дает `403`;
- `Unauthorized` дает `401`;
- `InternalServerError` дает `500`.

Если статус `400`, фильтр отдает структурированный JSON с `errorsMessages`.

### RPC mapping

В RPC-контексте смысл ошибки не должен теряться.

Поэтому код и payload переносятся в `RpcException`.

### Таблица соответствия

| DomainExceptionCode   | HTTP status | RPC payload                 |
| --------------------- | ----------: | --------------------------- |
| `ValidationError`     |       `400` | `RPC_VALIDATION_ERROR`      |
| `BadRequest`          |       `400` | `RPC_BAD_REQUEST`           |
| `Unauthorized`        |       `401` | `RPC_UNAUTHORIZED`          |
| `Forbidden`           |       `403` | `RPC_FORBIDDEN`             |
| `NotFound`            |       `404` | `RPC_NOT_FOUND`             |
| `TooManyRequests`     |       `429` | `RPC_TOO_MANY_REQUESTS`     |
| `InternalServerError` |       `500` | `RPC_INTERNAL_SERVER_ERROR` |

> Примечание: в текущей реализации RPC-код передается как payload-значение вместе с доменным кодом. Если проекту понадобится строгий enum RPC-кодов, его можно выделить отдельно в `libs/common`.

### Важный архитектурный смысл

`GlobalDomainExceptionFilter` не должен знать бизнес-деталей.

Он отвечает только за:

- определение типа хоста;
- транспортную адаптацию;
- единый формат ответа;
- отсутствие утечки сырых внутренних ошибок наружу.

---

## 7. Консистентная валидация

Файлы:

- [`validation-pipe-options.ts`](./validation-pipe-options.ts)
- [`validation-error.formatter.ts`](./validation-error.formatter.ts)

### Как это устроено

`BASE_VALIDATION_PIPE_OPTIONS` хранит базовые настройки `ValidationPipe`.

```ts
export const BASE_VALIDATION_PIPE_OPTIONS: ValidationPipeOptions = {
  transform: true,
  whitelist: true,
  stopAtFirstError: true,
  exceptionFactory: ...
};
```

### Зачем нужен `validation-error.formatter.ts`

`class-validator` возвращает сложный объект `ValidationError[]`:

- с `children`;
- с `constraints`;
- с вложенными ошибками;
- с частично пустыми полями.

Это неудобно для фронтенда и неудобно для одинакового ответа во всех сервисах.

Поэтому `formatValidationErrors(...)` превращает его в плоский массив:

```ts
type Extension = {
  field: string;
  message: string;
};
```

### Что нужно помнить при изменении

Если вы меняете формат ответа здесь, вы меняете формат ошибок во всех сервисах, которые используют `appSetup`.

Это глобальное изменение API, а не локальная правка.

### Пример ответа

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

## 8. Type Safety и `AppSetupOptions`

Файл: [`app-setup-options.ts`](./app-setup-options.ts)

### Почему настройки частичные

`AppSetupOptions` построен как набор частичных секций:

- `httpConfig?`
- `rpcConfig?`
- `validationCustomConfig?`

Это нужно потому, что разные сервисы используют разный набор инфраструктуры:

- gateway может быть HTTP-first;
- files-service может быть hybrid;
- будущий worker может быть RPC-only.

### Почему это лучше, чем один большой объект

Если собрать все параметры в одну жесткую структуру:

- сервисам придется передавать лишние значения;
- появятся фиктивные поля;
- вырастет количество условных проверок;
- расширение станет болезненным.

Частичное применение настроек позволяет:

- включать только нужные блоки;
- не ломать старые сервисы;
- поддерживать гибридные режимы;
- расширять библиотеку без каскадных изменений.

### Практическое правило

Если сервису не нужен HTTP, он не обязан настраивать Swagger, CORS и cookies.

Если сервису не нужен RPC, он не обязан думать о transport pipes.

Если сервису нужна особая валидация, он передает только `validationCustomConfig`.

---

## 9. Как добавить новый глобальный перехватчик

Если вам нужен новый глобальный interceptor, действуйте так:

### Шаг 1. Создайте interceptor в `libs/common/src/setup`

Например:

```ts
libs / common / src / setup / sentry.interceptor.ts;
```

### Шаг 2. Добавьте флаг в `AppSetupOptions`

Например:

```ts
export type AppSetupOptions = {
  httpConfig?: HttpSetupConfig;
  rpcConfig?: RpcSetupConfig;
  validationCustomConfig?: ValidationPipeOptions;
  sentryConfig?: SentryConfig;
};
```

### Шаг 3. Подключите interceptor внутри `appSetup`

```ts
if (options.sentryConfig?.enabled) {
  app.useGlobalInterceptors(new SentryInterceptor(options.sentryConfig));
}
```

### Шаг 4. Не дублируйте bootstrap в сервисах

Если interceptor глобальный, он должен быть подключаемым через `appSetup`, а не вручную в каждом `main.ts`.

### Правило

Если логика:

- общая для всех сервисов;
- инфраструктурная;
- не зависит от домена;

то она должна попадать в `libs/common/src/setup`.

---

## 10. Как изменить формат вывода ошибок валидации

Если нужно поменять формат ответа, делайте это в одном месте:

### Файл

- [`validation-error.formatter.ts`](./validation-error.formatter.ts)

### Что можно менять

- структуру `Extension`;
- формат `field`;
- формат `message`;
- добавление кода ошибки;
- добавление пути до вложенного поля;
- добавление метаданных для фронтенда.

### Что нельзя делать

- не стоит форматировать ошибки отдельно в каждом сервисе;
- не стоит возвращать raw `ValidationError[]` наружу;
- не стоит менять формат без осознания, что это глобальный контракт.

### Типичный сценарий эволюции

Если вы хотите получить:

```json
{
  "errorsMessages": [
    {
      "field": "profile.email",
      "message": "must be an email"
    }
  ]
}
```

то именно `formatValidationErrors(...)` должен собирать путь и сообщение.

---

## 11. Как читать `appSetup` как maintainer

Когда вы меняете `appSetup`, задайте себе три вопроса:

1. Это изменение касается всех сервисов или только одного?
2. Это изменение про транспорт, валидацию или доменные ошибки?
3. Не ломает ли это `main-gateway-service` и `micro-files-service` одновременно?

Если ответ "касается всех" и "про инфраструктуру", правка должна быть здесь.

Если ответ "только для одного сервиса", правка должна остаться в `apps/<service>/src`.

---

## 12. Короткое резюме

`libs/common/src/setup` — это не набор утилит.

Это внутренний bootstrap-контракт всего монорепозитория.

Он определяет:

- как приложение стартует;
- как валидируются входные данные;
- как обрабатываются доменные ошибки;
- как сервис ведет себя в HTTP и RPC;
- как подключается DI внутри валидаторов;
- как новые инфраструктурные блоки должны расширяться.
