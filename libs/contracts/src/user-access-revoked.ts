export const USER_ACCESS_REVOKED_ROUTING_KEY = 'gateway.user.access.revoked.v1';
export const USER_ACCESS_REVOKED_EVENT_TYPE = 'UserAccessRevoked';
export type UserAccessRevoked = Readonly<{
  eventId: string;
  version: 1;
  eventType: typeof USER_ACCESS_REVOKED_EVENT_TYPE;
  userId: string;
  sessionIds: string[];
  occurredAt: string;
}>;
