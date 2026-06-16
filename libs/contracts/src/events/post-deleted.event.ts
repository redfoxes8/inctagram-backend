export interface IPostDeletedEvent {
  eventId: string;
  postId: string;
  ownerId: string;
  fileIds: string[];
  occurredOn: string; // ISO timestamp
}

export const POST_DELETED_ROUTING_KEY = 'post.deleted';

export const POST_EVENTS_EXCHANGE = 'post_events';
