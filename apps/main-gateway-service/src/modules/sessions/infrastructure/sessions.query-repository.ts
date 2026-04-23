import { Injectable } from '@nestjs/common';
import {
  ISessionsQueryRepository,
  SessionViewModel,
} from '../domain/interfaces/sessions.query-repository.interface';
import { PrismaService } from '../../../core/prisma/prisma.service';

@Injectable()
export class PrismaSessionsQueryRepository implements ISessionsQueryRepository {
  constructor(private readonly prismaService: PrismaService) {}

  public async getAllActiveSessions(userId: string): Promise<SessionViewModel[]> {
    const sessions = await this.prismaService.session.findMany({
      where: {
        userId,
        deletedAt: null,
      },
      select: {
        deviceId: true,
        deviceName: true,
        ip: true,
        iat: true,
      },
      orderBy: {
        iat: 'desc',
      },
    });

    return sessions.map((session) => ({
      ip: session.ip,
      title: session.deviceName,
      lastActiveDate: new Date(session.iat * 1000).toISOString(),
      deviceId: session.deviceId,
    }));
  }
}
