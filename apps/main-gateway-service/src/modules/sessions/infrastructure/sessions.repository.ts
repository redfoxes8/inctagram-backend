import { Injectable } from '@nestjs/common';
import { SessionEntity } from '../domain/session.entity';
import { ISessionsRepository } from '../domain/interfaces/sessions.repository.interface';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { SessionMapper } from './mappers/session.mapper';

@Injectable()
export class PrismaSessionsRepository implements ISessionsRepository {
  constructor(private readonly prismaService: PrismaService) {}

  public async save(session: SessionEntity): Promise<void> {
    await this.prismaService.session.upsert({
      where: {
        deviceId: session.deviceId,
      },
      create: this.toCreateData(session),
      update: this.toUpdateData(session),
    });
  }

  public async findAllByUserId(userId: string): Promise<SessionEntity[]> {
    const sessions = await this.prismaService.session.findMany({
      where: {
        userId,
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return sessions.map((session) => SessionMapper.toDomain(session));
  }

  public async findByDeviceId(deviceId: string): Promise<SessionEntity | null> {
    const session = await this.prismaService.session.findFirst({
      where: {
        deviceId,
        deletedAt: null,
      },
    });

    return session ? SessionMapper.toDomain(session) : null;
  }

  public async findByUserIdAndDeviceId(
    userId: string,
    deviceId: string,
  ): Promise<SessionEntity | null> {
    const session = await this.prismaService.session.findFirst({
      where: {
        userId,
        deviceId,
        deletedAt: null,
      },
    });

    return session ? SessionMapper.toDomain(session) : null;
  }

  public async deleteByDeviceId(deviceId: string): Promise<void> {
    const deletedRows = await this.prismaService.session.deleteMany({
      where: {
        deviceId,
      },
    });

    if (deletedRows.count === 0) {
      throw this.createNotFoundException(deviceId);
    }
  }

  public async deleteAllOtherSessions(userId: string, currentDeviceId: string): Promise<void> {
    await this.prismaService.session.deleteMany({
      where: {
        userId,
        deviceId: {
          not: currentDeviceId,
        },
      },
    });
  }

  public async deleteAllByUserId(userId: string): Promise<void> {
    await this.prismaService.session.deleteMany({
      where: {
        userId,
      },
    });
  }

  public async update(session: SessionEntity): Promise<void> {
    const affectedRows = await this.prismaService.session.updateMany({
      where: {
        id: this.requireEntityId(session),
        userId: session.userId,
        deviceId: session.deviceId,
        deletedAt: null,
      },
      data: this.toUpdateData(session),
    });

    if (affectedRows.count === 0) {
      throw this.createNotFoundException(session.deviceId);
    }
  }

  private toCreateData(session: SessionEntity): {
    id: string;
    userId: string;
    deviceId: string;
    deviceName: string;
    ip: string;
    iat: number;
    exp: number;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
  } {
    return {
      id: this.requireEntityId(session),
      userId: session.userId,
      deviceId: session.deviceId,
      deviceName: session.deviceName,
      ip: session.ip,
      iat: session.iat,
      exp: session.exp,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      deletedAt: session.deletedAt,
    };
  }

  private toUpdateData(session: SessionEntity): {
    userId: string;
    deviceId: string;
    deviceName: string;
    ip: string;
    iat: number;
    exp: number;
    updatedAt: Date;
    deletedAt: Date | null;
  } {
    return {
      userId: session.userId,
      deviceId: session.deviceId,
      deviceName: session.deviceName,
      ip: session.ip,
      iat: session.iat,
      exp: session.exp,
      updatedAt: session.updatedAt,
      deletedAt: session.deletedAt,
    };
  }

  private requireEntityId(session: SessionEntity): string {
    if (session.id) {
      return session.id;
    }

    throw this.createNotFoundException(session.deviceId);
  }

  private createNotFoundException(identifier: string): DomainException {
    return new DomainException({
      code: DomainExceptionCode.NotFound,
      message: `Session with identifier ${identifier} was not found`,
    });
  }
}
