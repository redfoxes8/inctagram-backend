# Notification MS Handbook

This document is the reference guide, ADR summary, and onboarding handbook for `micro-notification-service`.

The goal of this service is simple: accept notification-related events from the backend, validate them strictly, and deliver emails reliably without leaking transport details into business logic.

---

## 1. High-Level Architecture & Emission Flow

### Why this architecture exists

We keep the notification flow event-driven so the core business flow in the Gateway does not depend on SMTP availability.

That gives us three important benefits:

1. The Gateway stays fast and focused on user actions.
2. Email delivery can fail and retry independently.
3. Adding new notification channels later does not require rewriting the business use cases.

### Message path

```text
Gateway Use Case
  -> Notification Facade
  -> RabbitNotificationAdapter
  -> RabbitMQ Queue
  -> Notification MS Consumer
  -> NotificationsService
  -> IMailAdapter
  -> NodemailerMailAdapter
  -> SMTP Provider
```

### End-to-end flow

```text
┌──────────────────────────┐
│ main-gateway-service     │
│                          │
│ RegisterUserUseCase      │
│ PasswordRecoveryUseCase  │
└─────────────┬────────────┘
              │ emit event
              v
┌──────────────────────────┐
│ Notification Facade      │
│ (RabbitNotificationAdapter)
└─────────────┬────────────┘
              │ ClientProxy.emit(...)
              v
┌──────────────────────────┐
│ RabbitMQ                 │
│ main queue + DLQ         │
└─────────────┬────────────┘
              │ consume event
              v
┌──────────────────────────┐
│ micro-notification-service│
│ NotificationsController  │
│  -> NotificationsService │
│  -> IMailAdapter         │
│  -> NodemailerMailAdapter│
└─────────────┬────────────┘
              │ send mail
              v
┌──────────────────────────┐
│ SMTP Provider            │
└──────────────────────────┘
```

### Responsibility split

| Node | Responsibility |
| --- | --- |
| Gateway Use Case | Produces business event when a user registers or requests password recovery |
| Notification Facade | Converts domain intent into transport event payload |
| RabbitNotificationAdapter | Hides RabbitMQ client details from application code |
| RabbitMQ Queue | Buffers events and allows retries |
| Notification MS Consumer | Validates payload and decides whether to process, retry, or dead-letter |
| NotificationsService | Selects template, subject, and context for a message |
| IMailAdapter | Abstract email port |
| NodemailerMailAdapter | Renders templates and sends email through SMTP |

### ADR note

The main architectural decision is to keep the business layer transport-agnostic.

We do not let a use case know about Nodemailer, RabbitMQ, or Handlebars. It only knows that a notification must be sent. That is the core clean architecture boundary.

---

## 2. Contract Safety

### Why payload contracts matter

The emitter and consumer must stay synchronized.

If the Gateway publishes a payload that does not match the DTO classes in this service, validation will reject the message on entry. In practice, that means:

1. The event will not be processed.
2. The mail will not be sent.
3. The message will either be acknowledged as invalid or routed out of the main flow depending on the consumer policy.

### Current event contracts

| RabbitMQ Event | Consumer DTO | Required fields |
| --- | --- | --- |
| `RegistrationEmailSent` | `RegistrationEmailSentDto` | `email`, `confirmationCode` |
| `PasswordRecoveryEmailSent` | `PasswordRecoveryEmailSentDto` | `email`, `recoveryCode` |

### Example payloads

```json
{
  "email": "user@example.com",
  "confirmationCode": "A1B2C3"
}
```

```json
{
  "email": "user@example.com",
  "recoveryCode": "Z9Y8X7"
}
```

### Contract safety rule

If you change a payload in the Gateway, you must change the DTO in `micro-notification-service` at the same time.

This is not optional. It is part of the contract between services.

### Practical rule of thumb

Before shipping any new notification event:

1. Define the event name in a shared enum or registry.
2. Define the payload schema.
3. Update the Gateway emitter.
4. Update the Notification MS DTO.
5. Add a validation test.

---

## 3. Reliability & Message Lifecycle

### Manual Ack / Nack

This service uses manual acknowledgment for RabbitMQ messages.

That means the consumer decides when a message is completed.

Why we avoid auto-ack:

1. Auto-ack would mark the message as processed before the mail is actually sent.
2. If Node.js crashes after the broker acks, the message is lost forever.
3. Manual ack protects against silent notification loss.

Current rule:

1. Process the message.
2. Send the email.
3. Only then call `ack`.
4. If processing fails, do not auto-complete the message.

### Retry policy with `x-retry-count`

We use a small retry window for transient failures.

The idea is to recover from temporary problems such as:

1. SMTP timeouts.
2. Provider rate limits.
3. Short network interruptions.

Current policy:

| Attempt | Behavior |
| --- | --- |
| 1st failure | Requeue with a small delay |
| 2nd failure | Requeue with a small delay |
| 3rd failure | Move to DLQ |

The retry counter is tracked using message headers:

- `x-retry-count`
- fallback support for broker metadata like `x-death` if present

### Why the delay exists

Without delay, a failing SMTP provider can be hammered by immediate retries.

The delay gives the provider time to recover and reduces the chance of hitting rate limits or creating a retry storm.

### Dead Letter Queue (DLQ)

Messages reach the DLQ in two cases:

1. All retry attempts are exhausted.
2. The payload is invalid and should not be replayed as-is.

DLQ is the safety net. It prevents poison messages from blocking the main queue.

### Who should inspect the DLQ

Usually the developer or the on-call engineer.

What to check:

1. Was the payload malformed?
2. Did the SMTP provider fail permanently?
3. Is the queue contract stale?
4. Did the sender and consumer DTOs diverge?

### Operational rule

Validation errors are not retryable.

If the data is invalid, a retry will not make it valid. Replaying the same message only creates noise.

---

## 4. Internal Device: Clean Architecture & Registry

### Layer overview

#### API layer

This layer contains:

- RabbitMQ event handlers
- DTO validation entry points
- manual ack / nack handling

The API layer is responsible for transport concerns only.

#### Application layer

This layer contains:

- `NotificationsService`
- use-case level notification orchestration

The application layer decides what template and subject belong to a business event.

#### Infrastructure layer

This layer contains:

- `NodemailerMailAdapter`
- Handlebars templates
- SMTP transport setup

The infrastructure layer knows how to send mail, but it does not know why the mail is being sent.

### IMailAdapter

`IMailAdapter` is the port that keeps the business layer independent from Nodemailer.

It allows us to:

1. Swap SMTP providers later.
2. Add Telegram or in-app channels without rewriting business logic.
3. Test the application layer without network calls.

### Environment variables used by Nodemailer

| Variable | Purpose |
| --- | --- |
| `SMTP_HOST` | SMTP server host |
| `SMTP_PORT` | SMTP server port |
| `SMTP_USER` | SMTP username |
| `SMTP_PASSWORD` | SMTP password |
| `SMTP_FROM_EMAIL` | Sender email address |
| `SMTP_FROM_NAME` | Human-readable sender name |

Additional runtime variables used by the service:

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP health/ops port |
| `FRONTEND_URL` | Base URL for generated links |
| `RABBITMQ_URL` | RabbitMQ connection string |
| `NOTIFICATION_QUEUE_NAME` | Main notification queue name |
| `NOTIFICATION_DEAD_LETTER_QUEUE_NAME` | DLQ name |

### Registry pattern

The registry maps event names to mail presentation settings.

| Event | Template | Subject |
| --- | --- | --- |
| `RegistrationEmailSent` | `registration-confirmation` | `Inctagram | Email Confirmation` |
| `PasswordRecoveryEmailSent` | `password-recovery` | `Inctagram | Password Recovery` |

Why this matters:

1. No hardcoded template names inside the service logic.
2. No hardcoded subject strings spread across controllers.
3. Changing a subject or template is a single-entry change.

### Template flow

1. The registry picks a template name.
2. `NotificationsService` builds the template context.
3. `NodemailerMailAdapter` compiles the body template.
4. The body is wrapped with `base-layout.hbs`.
5. The result is sent through SMTP.

---

## 5. Future-Proofing

### How to add a new email

Use this checklist:

1. Add a new event to `NotificationEvents`.
2. Add a registry entry in `NOTIFICATION_MESSAGE_REGISTRY`.
3. Create a new `.hbs` file in `src/infrastructure/templates/`.
4. Extend `NotificationsService` context building logic if the new template needs extra fields.
5. Add DTO validation in the consumer for the new event payload.
6. Add an emitter call in the Gateway.

### Example: adding a new channel

If we later add a channel like Telegram, the architecture should grow like this:

1. Introduce a new adapter under `src/infrastructure/adapters/telegram`.
2. Keep the application layer talking to a generic notification port, not to Telegram directly.
3. Extend the dispatcher so it can route by channel type.
4. Keep templates and message formatting in the application layer or a registry, not in the controller.

> **Не реализовано, задел на будущее**
>
> Telegram and in-app notifications are not implemented yet. The important design choice is that the current module structure already supports them without rewriting `main.ts` or the RabbitMQ consumer contract. We will add a new adapter and a channel dispatcher, while preserving the existing email pipeline.

### How a dispatcher would evolve

A future multi-channel dispatcher can use a pattern like this:

| Channel | Adapter | Responsibility |
| --- | --- | --- |
| Email | `IMailAdapter` | Send HTML emails |
| Telegram | `ITelegramAdapter` | Send Telegram messages |
| In-app | `IInAppAdapter` | Persist and publish UI notifications |

This keeps the service open for extension and closed for unnecessary rewrites.

---

## 6. Hybrid Module & AppSetup Philosophy

### Why this service is hybrid

`micro-notification-service` is not a pure worker. It is a hybrid application:

- HTTP is kept for operational endpoints.
- RabbitMQ is used for the real business workload.

Why keep HTTP:

1. Health checks for Kubernetes or Docker.
2. Metrics later, without changing the service topology.
3. A clear operational surface for readiness and liveness probing.

The HTTP port is not the public product API. It is an internal operational surface.

### Why `appSetup` is important

`appSetup` gives the service a consistent bootstrap policy:

1. strict validation pipes
2. global domain exception handling
3. shared prefix handling
4. transport inheritance for the microservice

### Hybrid validation problem

Hybrid apps need special care because RPC and HTTP do not behave exactly the same way.

We hit an important issue with invalid incoming messages:

1. Validation happens before business logic.
2. In an RPC context, a thrown validation exception can look like a failed consumer.
3. If the broker keeps redelivering the same invalid payload, we can end up with endless retries.

### How `GlobalDomainExceptionFilter` solved it

The shared `GlobalDomainExceptionFilter` has an RPC-specific branch.

For validation errors:

1. it recognizes the `DomainExceptionCode.ValidationError`
2. it acknowledges the message
3. it stops the retry loop

This is the correct behavior because invalid data should not be retried forever.

### Why `inheritAppConfig` matters

We connect the RMQ microservice with `inheritAppConfig: true` so the global pipes and filters configured by `appSetup` apply to both:

1. HTTP layer
2. RabbitMQ consumer layer

That keeps validation rules consistent across the whole service.

---

## 7. Developer Experience: Run, Test, Debug

### Launch order

Use this local start order:

1. RabbitMQ
2. `micro-notification-service`
3. `main-gateway-service`

Why this order matters:

1. The notification service must be able to connect to RabbitMQ on boot.
2. The Gateway emits notification events into the queue.
3. If RabbitMQ is missing, the emitter path cannot be verified.

### Local run checklist

1. Start RabbitMQ locally, for example with Docker.
2. Confirm the RabbitMQ Management UI is reachable.
3. Start `micro-notification-service`.
4. Start `main-gateway-service`.
5. Register a user or trigger password recovery.

### RabbitMQ Management UI

The management UI is usually available at:

- `http://localhost:15672`

Useful things to inspect:

1. Queues
2. Message rates
3. Ready vs unacked counts
4. DLQ depth
5. Message headers like `x-retry-count`

### How to inspect a stuck message

1. Open the queue in the RabbitMQ UI.
2. Look at the `Ready` and `Unacked` counts.
3. Inspect the message payload and headers.
4. Check the `routing key` and queue name.
5. Compare the payload with the DTO contract in the consumer.

### Manual test publish

You can test the worker without going through the frontend flow.

Option A: RabbitMQ UI publish

1. Open the queue in the Management UI.
2. Click `Publish message`.
3. Paste a payload like:

```json
{
  "email": "user@example.com",
  "confirmationCode": "A1B2C3"
}
```

4. Use the correct event routing key:

```text
RegistrationEmailSent
```

Option B: small script

Use a short Node.js script with RabbitMQ client code to send the same payload directly to the queue.

### Debugging tips

1. If the message never reaches the consumer, check queue name and broker URL first.
2. If it reaches the consumer but does not send mail, inspect SMTP credentials.
3. If it lands in the DLQ, inspect retry headers and payload contract.
4. If the worker loops on the same invalid payload, check DTO alignment.

---

## 8. Definition of Done

The service can be considered production-ready for the current email scope when all of the following are true:

1. The Gateway emits notification events instead of sending mail directly.
2. The notification service consumes RabbitMQ events successfully.
3. DTO validation is strict and consistent.
4. Manual ack/nack protects against message loss.
5. Retry and DLQ behavior is documented and observable.
6. Email templates are centralized and registry-driven.
7. Adding a new email does not require changing the transport layer.
8. HTTP remains available for operational checks.

---

## 9. Quick Reference

### Core files

| File | Purpose |
| --- | --- |
| `src/main.ts` | Hybrid bootstrap |
| `src/core/setup-notification-app.ts` | Local appSetup preset |
| `src/core/notification.config.ts` | Typed service config |
| `src/core/notification.constants.ts` | Events, templates, registry |
| `src/modules/notifications/api/notifications.controller.ts` | RMQ consumer |
| `src/modules/notifications/application/notifications.service.ts` | Business orchestration |
| `src/infrastructure/adapters/email/nodemailer-mail.adapter.ts` | SMTP adapter |
| `src/infrastructure/templates/*.hbs` | Email templates |

### RabbitMQ names

| Item | Value |
| --- | --- |
| Main queue | `NOTIFICATION_QUEUE_NAME` |
| DLQ | `NOTIFICATION_DEAD_LETTER_QUEUE_NAME` |
| Default local values | `micro-notification-service`, `micro-notification-service-dlq` |

### Notification events

| Event | Use case |
| --- | --- |
| `RegistrationEmailSent` | Email confirmation after registration |
| `PasswordRecoveryEmailSent` | Password reset email |

---

## Final Note

This service is intentionally small in public surface area and strict in its contracts.

That is the right tradeoff for a notification worker:

- small API
- predictable message lifecycle
- explicit failure handling
- easy future extension

If you understand the flow described above, you understand the service.
