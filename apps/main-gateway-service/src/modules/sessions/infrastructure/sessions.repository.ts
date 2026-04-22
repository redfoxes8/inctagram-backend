import { Injectable } from '@nestjs/common';
import { SessionEntity } from '../domain/session.entity';
import { ISessionsRepository } from '../domain/interfaces/sessions.repository.interface';

@Injectable()
export class PrismaSessionsRepository implements ISessionsRepository {
  public async save(session: SessionEntity): Promise<void> {
    void session;
    throw new Error('PrismaSessionsRepository is not implemented yet');
  }

  public async findByDeviceId(deviceId: string): Promise<SessionEntity | null> {
    void deviceId;
    throw new Error('PrismaSessionsRepository is not implemented yet');
  }

  public async findByUserIdAndDeviceId(userId: string, deviceId: string): Promise<SessionEntity | null> {
    void userId;
    void deviceId;
    throw new Error('PrismaSessionsRepository is not implemented yet');
  }

  public async deleteByDeviceId(deviceId: string): Promise<void> {
    void deviceId;
    throw new Error('PrismaSessionsRepository is not implemented yet');
  }

  public async deleteAllOtherSessions(userId: string, currentDeviceId: string): Promise<void> {
    void userId;
    void currentDeviceId;
    throw new Error('PrismaSessionsRepository is not implemented yet');
  }

  public async deleteAllByUserId(userId: string): Promise<void> {
    void userId;
    throw new Error('PrismaSessionsRepository is not implemented yet');
  }

  public async update(session: SessionEntity): Promise<void> {
    void session;
    throw new Error('PrismaSessionsRepository is not implemented yet');
  }
}
