export const PERSISTED_NOTIFICATION_EXCHANGE = 'common_exchange';
export const PERSISTED_NOTIFICATION_QUEUE_NAME =
  process.env.PERSISTED_NOTIFICATION_QUEUE_NAME || 'payment-notification-persistence-queue';
export const PERSISTED_NOTIFICATION_RETRY_QUEUE_NAME = `${PERSISTED_NOTIFICATION_QUEUE_NAME}.retry`;
export const PERSISTED_NOTIFICATION_DLQ_NAME = `${PERSISTED_NOTIFICATION_QUEUE_NAME}.dlq`;
export const PERSISTED_NOTIFICATION_RETRY_ROUTING_KEY = 'notification.payment-requested.retry';
export const PERSISTED_NOTIFICATION_DLQ_ROUTING_KEY = 'notification.payment-requested.dlq';
export const PERSISTED_NOTIFICATION_RETRY_HEADER = 'x-notification-persistence-retry-count';
export const PERSISTED_NOTIFICATION_TERMINAL_REASON_HEADER =
  'x-notification-persistence-terminal-reason';
export const PERSISTED_NOTIFICATION_RETRY_DELAY_MS = 300_000;
export const PERSISTED_NOTIFICATION_MAX_ATTEMPTS = 3;
