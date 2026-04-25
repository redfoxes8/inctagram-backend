# Micro Notification Service Infrastructure

## Required Environment Variables

The service validates these variables on startup:

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

## RabbitMQ Queues

### Main Queue

- Name: `NOTIFICATION_QUEUE_NAME`
- Example value: `micro-notification-service`
- Required queue options:
  - `durable: true`

### Dead Letter Queue

- Name: `NOTIFICATION_DEAD_LETTER_QUEUE_NAME`
- Example value: `micro-notification-service-dlq`
- Required queue options:
  - `durable: true`

### Retry Strategy

Current code uses a simple application-level retry policy:

- first and second failures are requeued to the main queue immediately (asynchronous retry without blocking the worker)
- when retry attempts are exhausted, the payload is sent to the DLQ
- invalid DTOs are acknowledged immediately and do not retry

> [!IMPORTANT]
> The artificial `await delay()` was removed to prevent blocking the Node.js Event Loop. Proper delayed retries should be implemented using the broker-managed strategy described below.

If you later move to broker-managed delayed retries, add a retry queue with:

- `x-message-ttl`
- `x-dead-letter-exchange`
- `x-dead-letter-routing-key`

That queue can then dead-letter back into the main queue after TTL expires.

## Template Handling

- `base-layout.hbs` is the shared HTML wrapper
- content templates are compiled first and inserted into `{{{body}}}`
- the logo URL is a placeholder and can be replaced later
