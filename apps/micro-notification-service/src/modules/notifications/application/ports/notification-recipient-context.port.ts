export type NotificationRecipientContext = Readonly<{
  userId: string;
  email: string;
  userName: string;
}>;

export abstract class NotificationRecipientContextPort {
  abstract getNotificationRecipientContext(userId: string): Promise<NotificationRecipientContext>;
}
