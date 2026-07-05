export interface IAvatarDeletedEvent {
  eventId: string;
  userId: string;
  previousAvatarFileId: string;
  occurredOn: string; // ISO timestamp
}

export const AVATAR_DELETED_ROUTING_KEY = 'profile.avatar.deleted';

export const PROFILE_EVENTS_EXCHANGE = 'profile_events';

export const AVATAR_DELETED_EVENT_TYPE = 'AVATAR_DELETED';
