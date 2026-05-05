import { SessionEntity } from '../../domain/session.entity';

type SessionRecord = {
  id: string;
  userId: string;
  deviceId: string;
  deviceName: string;
  ip: string;
  iat: number;
  exp: number;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date | null;
};

export class SessionMapper {
  public static toDomain(model: SessionRecord): SessionEntity {
    return new SessionEntity({
      id: model.id,
      userId: model.userId,
      deviceId: model.deviceId,
      deviceName: model.deviceName,
      ip: model.ip,
      iat: model.iat,
      exp: model.exp,
      createdAt: model.createdAt ?? new Date(),
      updatedAt: model.updatedAt ?? model.createdAt ?? new Date(),
      deletedAt: model.deletedAt ?? null,
    });
  }
}
