import { Injectable } from '@nestjs/common';
import { ISessionsQueryRepository, SessionViewModel } from '../domain/interfaces/sessions.query-repository.interface';

@Injectable()
export class PrismaSessionsQueryRepository implements ISessionsQueryRepository {
  public async getAllActiveSessions(userId: string): Promise<SessionViewModel[]> {
    void userId;
    throw new Error('PrismaSessionsQueryRepository is not implemented yet');
  }
}
