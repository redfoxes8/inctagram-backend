export class NotificationUserRoomFactory {
  public static forUser(userId: string): string {
    return `notifications:user:${userId}`;
  }
}
