export class SessionViewModel {
  ip: string;
  title: string;
  lastActiveDate: string;
  deviceId: string;
}

export abstract class ISessionsQueryRepository {
  abstract getAllActiveSessions(userId: string): Promise<SessionViewModel[]>;
}
