# Main Gateway Service

`main-gateway-service` is the public HTTP entrypoint for Inctagram.

It owns authentication, user-facing API routes, and the emission of notification events into RabbitMQ.

## Quick Start

```bash
# development
pnpm start:dev

# production
pnpm start:prod:main-gateway-service

# tests
pnpm test
```

## Environment

Fast-start variables to verify first:

- `PORT`
- `FILES_SERVICE_URL`
- `PRISMA_DB_URL`
- `FRONTEND_URL`
- `JWT_SECRET`
- `ACCESS_TOKEN_EXPIRE_TIME`
- `REFRESH_TOKEN_EXPIRE_TIME`
- `RABBITMQ_URL`
- `NOTIFICATION_QUEUE_NAME`

## Contract Quick-Ref

| Event Name | Payload |
| --- | --- |
| `RegistrationEmailSent` | `{ email, confirmationCode }` |
| `PasswordRecoveryEmailSent` | `{ email, recoveryCode }` |

## Notification Integration

The Gateway does not send email directly anymore.

Instead, auth use cases publish events through the notification facade:

1. `RegisterUserUseCase` emits `RegistrationEmailSent`
2. `PasswordRecoveryUseCase` emits `PasswordRecoveryEmailSent`
3. `RabbitNotificationAdapter` sends the event into RabbitMQ
4. `micro-notification-service` consumes the event and sends the email

This keeps the business flow fast and removes SMTP from the public API path.

## Architecture & Deep Dive

For the notification consumer contract, retry model, queue lifecycle, and onboarding notes, read:

- [Micro-Notification Service Handbook](../micro-notification-service/NOTIFICATION_MS_HANDBOOK.md)
- [Micro-Notification Service README](../micro-notification-service/README.md)

Those documents are the source of truth for the notification flow.
