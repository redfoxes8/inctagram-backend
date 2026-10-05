# Жизненный цикл платной Business-подписки

## 1. Назначение и границы

Этот документ описывает фактический путь платной Business-подписки в текущем коде. Под Business-подпиской здесь понимается оплаченный период `Subscription`, который Payment MS подтверждает интеграционным событием `subscription.activated.v1`. Дальнейшее применение entitlement выполняет Gateway, а не Stripe и не фронтенд. В процессе участвуют Frontend, main Gateway, Payment MS, Stripe, RabbitMQ и Notification MS. Документ не объявляет redirect Stripe доказательством оплаты: авторитетным основанием остаётся успешно проверенный webhook, обработанный Payment MS.

Payment хранит финансовые периоды и платежи, Notification хранит пользовательские уведомления, а Gateway предоставляет HTTP, gRPC-клиенты и Socket.IO. Поэтому одна покупка не является одной общей транзакцией всех сервисов: локальная оплата, email, persisted notification и realtime доставляются независимо и имеют eventual-consistency границы.

## 2. Участники и каналы связи

| Канал                                  | Назначение                                                   | Сложность                                       |
| -------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------- |
| Frontend → Gateway, HTTPS/JSON         | продукты, checkout, статусы, подписки и notifications        | Низкая: JWT и DTO-маппинг                       |
| Gateway → Payment MS, gRPC             | команды и запросы платежей                                   | Средняя: контракты и дедлайны                   |
| Stripe → Gateway → Payment, HTTPS/gRPC | подписанный webhook                                          | Высокая: подпись, journal, идемпотентность      |
| Payment → RabbitMQ                     | интеграционные события и `payment.notification.requested.v1` | Высокая: Outbox и retry                         |
| RabbitMQ → Notification/Gateway        | email, persisted notification и live events                  | Высокая: отдельные consumer-ы и DLQ             |
| Notification → User MS/SMTP            | контекст получателя и legacy email                           | Средняя: внешние зависимости вне DB transaction |
| Gateway → Frontend, Socket.IO          | best-effort live fan-out                                     | Средняя: JWT handshake и комнаты                |

## 3. Начало покупки

Сначала фронтенд получает товары через `GET /payments/products`. Затем он отправляет `POST /payments/checkout` с `productId`, provider и `autoRenewConsent`; заголовок `Idempotency-Key` обязателен и валидируется как UUID v4. Gateway берёт `userId` исключительно из JWT. Он не принимает `successUrl` от клиента: контроллер передаёт конфигурационный `SUCCESS_PAYMENT_URL` в Gateway command, затем mapper и gRPC передают его в Payment.

В Payment `CreateCheckoutSessionHandler` проверяет trusted URL и создаёт или повторно возвращает локальную `CheckoutSession` и `PaymentTransaction`. Для одинакового idempotency key повторный запрос должен вернуться к уже созданной локальной операции, а не создавать новый платёж. Затем Stripe strategy создаёт Checkout Session и возвращает локальный `checkoutSessionId`, Stripe `providerCheckoutId` (`cs_…`) и checkout URL. Публичный ответ Gateway формируется из gRPC response mapper.

`autoRenewConsent=false` сейчас не поддерживает создание checkout: gRPC request mapper и command требуют именно `true`; это контролируемый отказ, а не скрытое отключение продления. `success_url` передаётся Stripe как строка конфигурации. Placeholder `{CHECKOUT_SESSION_ID}` не удаляется Payment-кодом; Stripe подставляет его при redirect.

## 4. Первая Business-подписка

После того как Stripe завершает Checkout, он отправляет webhook в `POST /payments/webhook/stripe`. Gateway передаёт raw body, signature headers, provider `STRIPE` и время получения в Payment. Stripe strategy строит событие только после `webhooks.constructEvent`; некорректная подпись не становится локальным платежом.

Для initial success `InitialPaymentWebhookProcessor` получает/создаёт journal `ProviderWebhookEvent`, блокирует пользователя advisory lock и повторно читает checkout, transaction, product и provider customer. Он требует отсутствие незавершённой очереди. В одной Payment Unit of Work он создаёт `Subscription` с `status=ACTIVE`, `sequence=1`, периодом от provider `occurredAt`, связывает успешный `PaymentTransaction` и `CheckoutSession`, а journal переводит в processed. В ту же локальную транзакцию помещаются `payment.succeeded.v1` и `subscription.activated.v1` в Payment Outbox.

Именно `subscription.activated.v1` с routing key `payment.subscription.activated` является подтверждённым событием entitlement. Gateway получает его отдельным consumer-ом и применяет Business-статус через свой интеграционный путь к User/Profile MS. Конкретный transport и реализация изменения User/Profile находятся за пределами подтверждённых в этом чтении Payment файлов; место фактической записи Business в User/Profile **не подтверждено текущим кодом этого документа**. Повтор webhook защищён journal-статусом и детерминированными корреляциями, поэтому не должен повторно создавать период.

## 5. Дополнительная и queued-подписка

Дополнительная покупка не продлевает текущую строку `Subscription`. `AdditionalPaymentWebhookProcessor` читает ordered unfinished queue, берёт её tail и готовит новый период, начинающийся ровно в `tail.endsAt`. После внешнего Stripe шага он в новой короткой UoW вновь проверяет tail и создаёт отдельную оплаченною запись `QUEUED` с `sequence = tail.sequence + 1`; tail при включённом auto-renew отключается. Поэтому очередь имеет вид `ACTIVE → QUEUED`, а для нескольких prepaid покупок — `ACTIVE → QUEUED #2 → QUEUED #3`.

Если текущая ACTIVE является prepaid и не имеет `providerSubscriptionId`, это допустимый путь: Payment требует локальную ACTIVE и provider customer, но передаёт `currentProviderSubscriptionId=null`. Stripe strategy в этом случае пропускает только update старой Stripe subscription. Она всё равно использует сохранённый PaymentIntent, назначает default payment method customer и создаёт новый future schedule после конца всей локальной очереди. Если ID есть, прежнее поведение сохраняется: текущая Stripe subscription получает `cancel_at_period_end=true`.

Предыдущий schedule отменяется только когда Stripe сообщает `not_started`; schedule со status `canceled` повторно не отменяется. Затем создаётся новый `subscription_schedule` с `start_date=finalLocalEndsAt`, `end_behavior=release`. `autoRenewConsent=false` для additional checkout также остаётся контролируемо отклонённым. После успешной UoW Payment пишет `payment.succeeded.v1`, `subscription.queued.v1`, планирует paid-access notification и reminder slots, но сам факт `QUEUED` не является отдельным in-app notification.

## 6. Возврат пользователя после Stripe

Затем браузер возвращается на `SUCCESS_PAYMENT_URL`, например `/payment-success?session_id={CHECKOUT_SESSION_ID}`. Redirect несёт Stripe ID, а не локальный UUID, поэтому Gateway предоставляет статический маршрут `GET /payments/checkout/stripe/:providerCheckoutId/status` до параметрического UUID route. Он передаёт текущий JWT `userId`, provider `STRIPE` и `providerCheckoutId`; Payment ищет checkout по `(provider, providerCheckoutId)` и скрывает как отсутствующий, так и чужой checkout одним Not Found.

Старый `GET /payments/checkout/:checkoutSessionId/status` принимает локальный UUID и сохранён без изменения. Оба статуса приходят из локальной БД и имеют `CREATED | COMPLETED | EXPIRED | FAILED`; Stripe API при poll не вызывается. Поэтому фронтенд может опрашивать Stripe-session route после redirect, но должен учитывать задержку между redirect и обработкой webhook.

## 7. Stripe webhook

Webhook handler сначала валидирует подпись и нормализует provider event. Journal не даёт одному provider event примениться повторно. Initial и additional success создают локальные записи в транзакции; failure переводит соответствующий transaction/checkout в `FAILED` и помещает `payment.failed.v1` в Outbox. Дубликат обработанного webhook не должен повторить финансовую операцию.

Recurring webhook отделён от Checkout. `RecurringPaymentWebhookProcessor` коррелирует invoice с `providerSubscriptionId`, customer, product/provider mapping и schedule. При success он создаёт **новую** `Subscription` с `sequence=tail.sequence+1`, периодом от прежнего tail end и тем же provider subscription/schedule ID, а прежний tail вызывает `releaseRenewalOwnership()`. Если уже есть ACTIVE, новая запись QUEUED; если ACTIVE нет и граница допустима, она ACTIVE. При failure создаётся/фиксируется `PaymentTransaction` renewal в `FAILED`; существующий период не превращается в оплаченный новый период. При recovery success тот же invoice transaction переходит в `SUCCEEDED`, и создаётся следующий период; дополнительно формируется `PAYMENT_RECOVERED` notification.

## 8. Раздвоение и растроение пайплайна

После того как локальная транзакция успешна, происходит раздвоение пайплайна. Первый путь — integration events из Payment Outbox: они несут payment/subscription facts для legacy email и entitlement. Второй путь — `PaymentNotificationSchedule`, который спустя aggregation delay создаёт persisted in-app notification. Эти процессы не входят в webhook transaction и не должны блокировать локальную фиксацию оплаты.

В этот момент происходит растроение доставки уведомлений. Legacy email consumer обрабатывает payment integration events. Persisted pipeline публикует `payment.notification.requested.v1`, Notification MS хранит notification и создаёт свой Outbox. Наконец Gateway получает `notification.created.v1` и пытается отправить Socket.IO всем текущим вкладкам пользователя. Отсутствующий socket не отменяет сохранённое notification: история и unseen count доступны по HTTP.

## 9. Business entitlement

Payment пишет `subscription.activated.v1` для initial ACTIVE, lifecycle activation QUEUED и recurring success, когда новый период сразу ACTIVE. В lifecycle `SubscriptionLifecycleService` делает это в той же UoW, где прежний ACTIVE становится `EXPIRED`, а replacement QUEUED становится `ACTIVE`. Routing key — `payment.subscription.activated`. Gateway consumer и его DI wiring следует искать в [payments module Gateway](../main-gateway-service/src/modules/payments); конкретная команда User/Profile и её retry/DLQ не подтверждены прочитанными Payment/Notification участками и потому не утверждаются здесь.

## 10. Email-жизненный цикл

Legacy `PaymentEventsConsumer` Notification MS подписан на `common_exchange`, queue `payment-notification-queue` (или `PAYMENT_NOTIFICATION_QUEUE_NAME`), named channel `payment-notification-email` с prefetch 1. Он получает recipient context через port, затем вызывает SMTP adapter вне Prisma transaction. В queue задан DLX `common_exchange` и routing `notification.payment.dlq`. P2028 на initial claim возвращает `Nack(false)`; неверный payload тоже идёт в DLQ. Ошибки email после ограниченного числа попыток также получают `Nack(false)`, а промежуточный retry использует backoff и `Nack(true)`.

| Веха                                       | Email реализован                   | Источник                             | Consumer/template                          | Retry/DLQ                    |
| ------------------------------------------ | ---------------------------------- | ------------------------------------ | ------------------------------------------ | ---------------------------- |
| Успешная initial/additional/renewal оплата | Да                                 | `payment.succeeded.v1`               | `PaymentEventsConsumer` / PaymentSucceeded | delivery attempts, затем DLQ |
| Ошибка renewal/checkout                    | Да                                 | `payment.failed.v1`                  | PaymentFailed                              | то же                        |
| Новый queued период                        | Да                                 | `subscription.queued.v1`             | SubscriptionQueued                         | то же                        |
| Активация периода                          | Да                                 | `subscription.activated.v1`          | SubscriptionActivated                      | то же                        |
| Истечение без replacement                  | Да; replacement помечается skipped | `subscription.expired.v1`            | SubscriptionExpired                        | то же                        |
| Auto-renew toggle                          | Да                                 | `subscription.auto-renew.changed.v1` | AutoRenewChanged                           | то же                        |
| Напоминание о приближении оплаты/истечении | Не подтверждено текущим кодом      | —                                    | —                                          | —                            |

## 11. Persisted notification

Параллельно основной операции `StagePaidAccessNotificationService` создаёт или объединяет `PaymentNotificationSchedule`. Для initial это `SUBSCRIPTION_ACTIVATED`, для additional и обычного renewal — `SUBSCRIPTION_EXTENDED`; если additional приходит в aggregation window initial, schedule может быть объединён. Due time ставится на 30 секунд позже staging. `ProcessDuePaymentNotificationScheduleService` claim-ит due schedule, проверяет текущий ACTIVE и непрерывные queued horizons, затем создаёт `payment.notification.requested.v1` в Payment Outbox и завершает schedule в одной UoW. Типы `PAYMENT_FAILED` и `PAYMENT_RECOVERED` создаются непосредственно recurring processor-ом как Outbox events.

Payment Outbox relay публикует в durable topic exchange `common_exchange` с routing `payment.notification.requested`; его работа зависит от `PAYMENT_OUTBOX_RELAY_ENABLED`, cron/batch/backoff/max-attempts параметров и Rabbit URL. Notification `PersistedPaymentNotificationConsumer` читает durable queue `payment-notification-persistence-queue`, retry queue и DLQ. В одной Notification DB transaction repository создаёт/находит Inbox по `eventId`, Notification по deterministic `businessKey` и NotificationOutbox для `notification.created.v1`. Таким образом eventId и businessKey предотвращают повторное создание. Retry задержан на 300000 ms, после лимита сообщение идёт в DLQ. Payment schedule transport также имеет delay/process/retry/DLQ очереди; recovery включается `PAYMENT_NOTIFICATION_RECOVERY_ENABLED`.

Reminder schedule `SubscriptionReminder` создаётся при paid periods. Его due worker и scheduler относятся к отдельной реализации reminders; точный runtime status этой части **не подтверждён текущим кодом, прочитанным для документа**. Поэтому наличие письма или in-app reminder именно за 7/1 день не утверждается как end-to-end гарантия.

## 12. WebSocket-доставка

NotificationOutbox publisher отправляет `notification.created.v1` в `common_exchange` с routing `notification.created`. Gateway `NotificationLiveEventConsumer` создаёт на каждом Gateway process exclusive, auto-delete, non-durable subscriber queue и принимает также `gateway.notifications.unseen-count.changed.v1`. Следовательно, realtime — best-effort: offline process или socket не получает старое сообщение, но запись уже доступна через HTTP.

Комната создаётся не во время платежа. `NotificationsGateway` принимает WebSocket namespace `/notifications`, path `/socket.io`, только transport `websocket`; middleware читает `socket.handshake.auth.accessToken`, проверяет access JWT и при connection вызывает join комнаты `notifications:user:${userId}`. Все вкладки одного пользователя входят в одну комнату; другой user не может попасть туда без валидного JWT с его userId. Событие `notification.created` несёт публичный notification item и `unseenCount`; отдельное `notifications.unseen-count` несёт `unseenCount`, а при mark seen ещё `seenThrough`.

## 13. Продление и ошибка списания

До границы lifecycle scheduler claim-ит due ACTIVE. На границе он под user lock читает unfinished queue. При наличии непрерывного QUEUED active истекает, QUEUED активируется и создаются `subscription.expired.v1` плюс `subscription.activated.v1`. При отсутствии replacement активный период истекает. Старые записи не удаляются: они остаются историей с terminal status.

| Объект               | До границы                                  | На границе                                 | После границы                                                                                  |
| -------------------- | ------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Прежняя local ACTIVE | текущая, `sequence=n`, owns renewal         | `EXPIRED` через `expire(now)`              | история                                                                                        |
| Прежняя QUEUED       | paid future, `sequence=n+1`                 | `ACTIVE` через `activateQueued(now)`       | current period                                                                                 |
| Новый renewal period | отсутствует до payment success              | может быть создан webhook-ом отдельно      | новая ACTIVE либо QUEUED, `sequence+1`                                                         |
| PaymentTransaction   | старый success либо renewal pending/failed  | lifecycle его не меняет                    | renewal success/failure фиксирует отдельная запись                                             |
| Stripe Subscription  | действует/может иметь cancel-at-period-end  | Stripe порядок webhook не задаётся Payment | ownership release относится к локальной tail; provider correlation сохраняется в новых periods |
| Stripe Schedule      | future `not_started` либо canceled/released | lifecycle не вызывает Stripe               | schedule ownership может перейти новому local tail                                             |

Успешный renewal создаёт новую local period, а не продлевает `endsAt` старой строки. Failed renewal создаёт/фиксирует failed transaction и in-app `PAYMENT_FAILED`, но новой paid horizon не создаёт. Recovered payment создаёт следующий период, пишет `PAYMENT_RECOVERED`; если есть active period, этот следующий период QUEUED. Точный порядок нескольких Stripe webhook между schedule release и invoice не гарантирован кодом; processor требует correlation и возвращает retryable reconciliation, если facts ещё не готовы.

При покупке ещё одного prepaid периода до границы новый QUEUED присоединяется к tail. Stripe strategy отменяет лишь future `not_started` schedule и создаёт replacement после конечного local tail. При disable auto-renew strategy отменяет `not_started` schedule, а для released/completed subscription задаёт `cancel_at_period_end=true`; enable снимает cancel flag либо создаёт schedule, если subscription отсутствует. Локальный toggle перепроверяет tail и обновляет autoRenew после provider operation. Непрерывность `startsAt=predecessor.endsAt` исключает намеренный разрыв; пересечение запрещено lifecycle/queue проверками. Реальное отсутствие временной щели в Stripe Dashboard **не подтверждено текущим кодом**.

## 14. Выключение и включение auto-renew

Фронтенд вызывает `PATCH /payments/subscriptions/:subscriptionId/auto-renew`. Gateway передаёт JWT userId и `enabled` в gRPC. `ToggleAutoRenewHandler` сначала в локальной UoW проверяет ownership, tail, неистёкший период, mapping и customer. Затем provider operation выполняется вне DB transaction. После неё новая UoW повторно сравнивает snapshot и записывает `enableAutoRenew` либо `disableAutoRenew`, reconciliation reminder slots и `subscription.auto-renew.changed.v1` с фактическим database timestamp.

При выключении future not-started schedule отменяется; canceled schedule не отменяется повторно. При включении существующая Stripe subscription получает `cancel_at_period_end=false`, либо создаётся new schedule на local period boundary. Toggle не добавляет новый paid period.

## 15. DTO и contract map

| Этап              | DTO/contract                        | Ключевые поля                                                       | Следующий получатель    |
| ----------------- | ----------------------------------- | ------------------------------------------------------------------- | ----------------------- |
| Checkout          | `CreateCheckoutSessionRequest`      | userId, productId, provider, idempotencyKey, autoRenewConsent, URLs | Payment gRPC            |
| Checkout response | `CreateCheckoutSessionResponse`     | local ID, providerCheckoutId, checkoutUrl, status                   | Gateway HTTP DTO        |
| Webhook           | provider webhook request            | raw body, signature, provider, receivedAt                           | Payment webhook command |
| Integration       | `payment.*.v1`, `subscription.*.v1` | eventId, userId, payment/subscription facts                         | Outbox → Rabbit         |
| Persisted request | `payment.notification.requested.v1` | type, userId, businessKey, subscription boundary                    | Notification consumer   |
| Notification item | `NotificationItemV1`                | id, type, effectiveAt, seenAt, subscription/invoice refs            | HTTP and Socket.IO      |
| Live event        | `notification.created.v1`           | userId, item, unseenCount                                           | Gateway live consumer   |

## 16. Механизмы надёжности

Database transaction фиксирует локальные checkout/payment/subscription/journal/outbox изменения вместе. Idempotency key защищает create checkout, webhook journal — provider delivery, Payment Outbox — Rabbit publish после commit, Notification Inbox и businessKey — повтор persisted event. Relay использует claim, locks, retry/backoff и terminal `FAILED`; queue consumers имеют DLQ. Payment notification schedule также имеет claim/recovery. После пропущенного WebSocket клиент восстанавливает состояние HTTP history/unseen-count, а не ждёт повторный realtime event.

## 17. Фактическая последовательность endpoint-вызовов

1. Frontend вызывает `GET /payments/products`.
2. Frontend вызывает `POST /payments/checkout` с `Idempotency-Key`.
3. Frontend перенаправляется на checkout URL Stripe.
4. Stripe вызывает `POST /payments/webhook/stripe`; фронтенд webhook не вызывает.
5. После redirect фронтенд вызывает `GET /payments/checkout/stripe/:providerCheckoutId/status` либо локальный UUID status route до `COMPLETED/FAILED`.
6. Frontend читает `GET /payments/subscriptions`, `GET /payments/history`; toggles auto-renew PATCH route.
7. Frontend читает notifications history/unseen count и вызывает mark seen через Gateway notification API.

## 18. Что синхронно, а что eventual consistency

Синхронны HTTP/gRPC создание локального checkout и ответ с URL, а также status/history queries. Stripe Checkout и webhook асинхронны относительно браузера. Локальная webhook transaction синхронно сохраняет финансовый факт и Payment Outbox, но Rabbit publish, email, persisted notification, Notification Outbox и Socket.IO происходят позднее. Redirect не ожидает Outbox, email или Socket.IO.

## 19. Карта исходного кода

Ключевые точки: [Gateway payment controller](../main-gateway-service/src/modules/payments/api/payment.controller.ts), [Gateway payment mapper](../main-gateway-service/src/modules/payments/api/mappers/payment-request.mapper.ts), [Payment proto](../../libs/contracts/src/proto/payment.proto), [checkout command](src/modules/payment/application/commands/create-checkout-session.command.ts), [Stripe strategy](src/modules/payment/infrastructure/providers/stripe-payment-provider.strategy.ts), [initial processor](src/modules/payment/application/services/initial-payment-webhook.processor.ts), [additional processor](src/modules/payment/application/services/additional-payment-webhook.processor.ts), [renewal processor](src/modules/payment/application/services/recurring-payment-webhook.processor.ts), [lifecycle](src/modules/payment/application/services/subscription-lifecycle.service.ts), [toggle](src/modules/payment/application/commands/toggle-auto-renew.command.ts), [paid notification staging](src/modules/payment/application/services/stage-paid-access-notification.service.ts), [due notification processor](src/modules/payment/application/services/process-due-payment-notification-schedule.service.ts), [legacy email consumer](../micro-notification-service/src/modules/notifications/api/rabbit/payment-events.consumer.ts), [persisted consumer](../micro-notification-service/src/modules/notifications/api/rabbit/persisted-payment-notification.consumer.ts), [Notification persistence](../micro-notification-service/src/modules/notifications/infrastructure/repositories/prisma-notification-persistence.repository.ts), [Socket gateway](../main-gateway-service/src/modules/notifications/api/ws/notifications.gateway.ts), [live consumer](../main-gateway-service/src/modules/notifications/infrastructure/notification-live-event.consumer.ts).

Focused evidence lives beside the modules: `initial-payment-webhook.processor.spec.ts`, `additional-payment-webhook.processor.spec.ts`, `recurring-payment-webhook.processor.spec.ts`, `subscription-lifecycle.service.spec.ts`, `create-checkout-session.command.spec.ts`, `stripe-checkout-status.spec.ts`, `payment-events.consumer.spec.ts`, `persisted-payment-notification.consumer.spec.ts` and `notifications-websocket.gateway.spec.ts`.

## 20. Подтверждённые ограничения и пробелы

- `autoRenewConsent=false` не создаёт checkout; это намеренный текущий reject.
- Redirect Stripe не подтверждает webhook application и потому UI обязан читать локальный status.
- Realtime Gateway queue ephemeral; offline delivery восстанавливается HTTP, а не broker replay.
- Email reminders за 7/1 день не подтверждены найденным email sender.
- Конкретный User/Profile consumer, реально меняющий Business flag, и его DLQ/retry не подтверждены прочитанными файлами.
- Runtime включение scheduler/relay зависит от env flags; документ называет flags, но не раскрывает их значения.
