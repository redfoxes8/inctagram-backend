# Frontend Notification Integration Guide

This guide describes how to integrate the Inctagram Notification System into frontend applications using Socket.IO realtime events alongside the authoritative HTTP API.

---

## 1. Transport

- **Protocol**: Socket.IO client (not raw WebSocket).
- **Namespace**: `/notifications`
- **Path**: `/socket.io`
- **Transports**: `['websocket']`
- **Gateway Base URL**: Provided by frontend environment configuration (e.g. `process.env.NEXT_PUBLIC_GATEWAY_URL`).

---

## 2. Authentication

Authentication is performed during the Socket.IO handshake using `auth.accessToken`.

```typescript
import { io, Socket } from 'socket.io-client';

const socket: Socket = io(`${gatewayBaseUrl}/notifications`, {
  path: '/socket.io',
  transports: ['websocket'],
  auth: {
    accessToken,
  },
});
```

- Only `auth.accessToken` is supported (do not pass tokens in `auth.token`, cookies, or headers).
- If the token is missing, expired, or invalid, the handshake fails with a `connect_error`:
  - `error.message === 'Unauthorized'`
  - `error.data?.code === 'UNAUTHORIZED'`
- **Token refresh**: When the access token is refreshed, update `socket.auth = { accessToken: newAccessToken }` and reconnect.
- **Logout**: Disconnect the socket immediately on logout.

---

## 3. Server Events

The backend emits two realtime events:

- `notification.created`
- `notifications.unseen-count`

### Contracts & Types

```typescript
export type PaymentNotificationType =
  | 'SUBSCRIPTION_ACTIVATED'
  | 'SUBSCRIPTION_EXTENDED'
  | 'UPCOMING_PAYMENT'
  | 'SUBSCRIPTION_EXPIRING'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_RECOVERED'
  | 'SUBSCRIPTION_CANCELLED';

export type NotificationItemV1 = {
  id: string;
  type: PaymentNotificationType;
  subscriptionId: string | null;
  providerInvoiceId: string | null;
  effectiveAt: string; // ISO-8601 UTC
  subscriptionEndsAt: string | null; // ISO-8601 UTC
  reasonCode: string | null;
  createdAt: string; // ISO-8601 UTC
  seenAt: string | null; // ISO-8601 UTC
};

export type NotificationCreatedWebSocketPayload = {
  notification: NotificationItemV1;
  unseenCount: number;
};

export type NotificationsUnseenCountWebSocketPayload = {
  unseenCount: number;
  seenThrough?: string; // ISO-8601 UTC (present on seen-flow)
};
```

### Event Semantics

1. **`notification.created`**:
   - Carries the new notification item and the updated total `unseenCount`.
   - Frontend should deduplicate by `notification.id`, prepend to the notification list, and update its unread badge to `unseenCount`.
2. **`notifications.unseen-count`**:
   - Carries the absolute unseen count (not a relative delta).
   - `seenThrough` is optional and present when triggered by the mark-seen flow.
   - Frontend must replace its local count with `unseenCount` directly rather than manually incrementing or decrementing.

---

## 4. HTTP API

All endpoints require a Bearer access token: `Authorization: Bearer <accessToken>`.

### 4.1. Get Notification History

```http
GET /api/v1/notifications?cursor=<cursor>&pageSize=<pageSize>
```

- **Query Parameters**:
  - `pageSize`: integer, optional, default `20`, range `1..100`.
  - `cursor`: string, optional. Opaque base64 string returned in `nextCursor` of previous page. Must never be parsed, constructed, or modified by frontend.
- **Semantics**: Keyset pagination (`createdAt DESC, id DESC`) scoped strictly to the current UTC calendar month. If `nextCursor` is omitted/undefined, no further records exist in the current calendar month.
- **Success Response (200 OK)**:
  ```json
  {
    "items": [
      {
        "id": "20000000-0000-4000-8000-000000000001",
        "type": "SUBSCRIPTION_ACTIVATED",
        "subscriptionId": "30000000-0000-4000-8000-000000000001",
        "providerInvoiceId": "in_123456",
        "effectiveAt": "2026-09-01T12:00:00.000Z",
        "subscriptionEndsAt": "2026-10-01T12:00:00.000Z",
        "reasonCode": null,
        "createdAt": "2026-09-01T12:00:00.000Z",
        "seenAt": null
      }
    ],
    "nextCursor": "eyJ2ZXJzaW9uIjoxLCJjcmVhdGVkQXQiOiIyMDI2LTA5LTAxVDEyOjAwOjAwLjAwMFoiLCJpZCI6Ii4uLiJ9"
  }
  ```
- **Errors**:
  - `400 Bad Request`: invalid `pageSize` or malformed `cursor`.
  - `401 Unauthorized`: missing or invalid token.
  - `503 Service Unavailable`: Notification microservice unavailable.
  - `504 Gateway Timeout`: gRPC call exceeded 3000ms timeout.
  - `500 Internal Server Error`.

### 4.2. Get Unseen Count

```http
GET /api/v1/notifications/unseen-count
```

- **Body / Query**: None.
- **Success Response (200 OK)**:
  ```json
  {
    "unseenCount": 3
  }
  ```
- **Errors**: `401`, `503`, `504` (3000ms timeout), `500`.

### 4.3. Mark Notifications as Seen

```http
PATCH /api/v1/notifications/seen
```

- **Body / Query**: None.
- **Semantics**: Marks all currently unseen notifications created at or before server time as seen (`seenAt = seenThrough`).
- **Success Response (200 OK)**:
  ```json
  {
    "unseenCount": 0,
    "seenThrough": "2026-09-01T12:05:00.000Z"
  }
  ```
- **Realtime Side Effect**: Gateway broadcasts `notifications.unseen-count` with payload `{ unseenCount: 0, seenThrough }` to all active WebSocket sessions of this user across all tabs/devices.
- **Errors**: `401`, `503`, `504` (3000ms timeout), `500`.

---

## 5. Recommended Frontend Lifecycle

1. **On Login**: Connect Socket.IO to `/notifications` with `auth: { accessToken }`.
2. **Initial Load**: After connection, fetch initial notification history (`GET /api/v1/notifications`) and count (`GET /api/v1/notifications/unseen-count`) via HTTP.
3. **On `notification.created`**:
   - Deduplicate using `notification.id` before adding to the list.
   - Update unread badge directly to received `unseenCount`.
4. **On `notifications.unseen-count`**:
   - Set unread badge to received `unseenCount`.
5. **On Reconnect**:
   - Re-fetch history and unseen count via HTTP to reconcile any events missed while disconnected.
6. **On Opening Notifications Panel**:
   - Call `PATCH /api/v1/notifications/seen`.
   - Mark displayed items as seen locally (or await the server response/event).
7. **On Logout**:
   - Call `socket.disconnect()` and clear notification state.

### Architectural Rules

- **Authoritative Source of Truth**: The HTTP API and backend database are authoritative. WebSocket is best-effort realtime delivery.
- **Offline Reconciliation**: Events missed while offline or during page navigation are recovered via HTTP.
- **Multi-Tab Support**: All active tabs for the authenticated user receive live events simultaneously. User room routing is managed entirely by the backend.
- **No Frontend ACKs**: Do not emit client ACKs or reply events.
- **Event Idempotency**: Realtime event handlers must be idempotent.
- **Race Independence**: Never assume strict ordering between HTTP responses and WebSocket events.

---

## 6. Ready-to-Use Client Example

```typescript
import { io, Socket } from 'socket.io-client';
import type {
  NotificationCreatedWebSocketPayload,
  NotificationsUnseenCountWebSocketPayload,
} from './notification-types';

export class NotificationClient {
  private socket: Socket | null = null;

  constructor(
    private readonly gatewayUrl: string,
    private readonly onNotification: (payload: NotificationCreatedWebSocketPayload) => void,
    private readonly onUnseenCount: (payload: NotificationsUnseenCountWebSocketPayload) => void,
    private readonly onResyncRequired: () => Promise<void>,
  ) {}

  public connect(accessToken: string): void {
    if (this.socket) {
      this.socket.disconnect();
    }

    this.socket = io(`${this.gatewayUrl}/notifications`, {
      path: '/socket.io',
      transports: ['websocket'],
      auth: { accessToken },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.socket.on('connect', () => {
      // Re-sync authoritative state on every (re)connection
      void this.onResyncRequired();
    });

    this.socket.on('connect_error', (error) => {
      if (error.message === 'Unauthorized') {
        // Handle token expiration / refresh
      }
    });

    this.socket.on('notification.created', (payload: NotificationCreatedWebSocketPayload) => {
      this.onNotification(payload);
    });

    this.socket.on(
      'notifications.unseen-count',
      (payload: NotificationsUnseenCountWebSocketPayload) => {
        this.onUnseenCount(payload);
      },
    );
  }

  public updateToken(newAccessToken: string): void {
    if (this.socket) {
      this.socket.auth = { accessToken: newAccessToken };
      if (!this.socket.connected) {
        this.socket.connect();
      }
    }
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
  }
}
```

---

## 7. Verification Status

The backend automatically verifies:

- Handshake JWT verification and unauthorized connection rejection (`UNAUTHORIZED`).
- User room joining and isolation between different users.
- Multi-tab fan-out delivery for connected sessions of the same user.
- WebSocket payload contracts for `notification.created` and `notifications.unseen-count`.
- Notification inbox persistence and transactional outbox emission.
- Keyset pagination, UTC month bounding, and mark-seen batch updates.

> Real multi-process RabbitMQ E2E is not part of this guide; compatibility is covered by shared contracts and focused automated tests.
