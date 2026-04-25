# Micro-Notification Service

`micro-notification-service` is the event-driven notification worker for Inctagram.

It consumes RabbitMQ events, validates payloads strictly, and sends emails through SMTP.

## Quick Start

```bash
# development
pnpm start:notification

# production
pnpm start:prod:micro-notification-service

# tests
pnpm test
```

## Environment

Fast-start variables to verify first:

- `PORT`
- `FRONTEND_URL`
- `RABBITMQ_URL`
- `NOTIFICATION_QUEUE_NAME`
- `NOTIFICATION_DEAD_LETTER_QUEUE_NAME`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM_EMAIL`
- `SMTP_FROM_NAME`

## Contract Quick-Ref

| Event Name | DTO |
| --- | --- |
| `RegistrationEmailSent` | `RegistrationEmailSentDto` |
| `PasswordRecoveryEmailSent` | `PasswordRecoveryEmailSentDto` |

## Health & Ops

- HTTP port: `PORT`
- Health-check endpoint: `GET /health`
- Example local URL: `http://localhost:3002/health`

## Architecture & Deep Dive

For the full architecture, reliability model, RabbitMQ lifecycle, retry policy, and onboarding notes, read the handbook:

- [NOTIFICATION_MS_HANDBOOK.md](./NOTIFICATION_MS_HANDBOOK.md)

That document is the source of truth for this service.

## Technical Debt

The current implementation contains intentional architectural simplifications for the MVP phase. Address these before deploying to a high-load Kubernetes environment:

1. **Domain Isolation (Architectural Violation)**:
   - The `NotificationsController` currently builds frontend URLs, handles templates, and manages retries directly.
   - **Fix**: Move the core orchestration logic into an application use case (e.g., `ProcessRegistrationNotificationUseCase`). The controller should only forward the generic payload.
2. **Observability Tracking**:
   - Error logs in `NotificationsController` lacking a consistent `correlationId` make it difficult to trace cross-service requests.
   - **Fix**: Extract and inject the `correlationId` from metadata into logging contexts.
3. **Advanced RabbitMQ Delay Logic**:
   - The current consumer immediately requeues failed messages. A 15-minute downstream outage will exhaust max retries instantly.
   - **Fix**: Use RabbitMQ Delayed Exchanges or Dead Letter Exchanges (DLX) combined with TTL to implement staggered, asynchronous backoff instead of immediate requeuing.
