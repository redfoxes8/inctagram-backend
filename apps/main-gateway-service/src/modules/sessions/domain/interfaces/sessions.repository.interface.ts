import { SessionEntity } from '../session.entity';

export abstract class ISessionsRepository {
  abstract save(session: SessionEntity): Promise<void>;

  abstract findByDeviceId(deviceId: string): Promise<SessionEntity | null>;

  abstract findByUserIdAndDeviceId(userId: string, deviceId: string): Promise<SessionEntity | null>;

  abstract deleteByDeviceId(deviceId: string): Promise<void>;

  abstract deleteAllOtherSessions(userId: string, currentDeviceId: string): Promise<void>;

  abstract deleteAllByUserId(userId: string): Promise<void>;

  abstract update(session: SessionEntity): Promise<void>;
}
