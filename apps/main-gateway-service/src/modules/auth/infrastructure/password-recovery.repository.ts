import { Injectable } from '@nestjs/common';
import { PasswordRecoveryEntity } from '../domain/password-recovery.entity';
import { IPasswordRecoveryRepository } from '../domain/interfaces/password-recovery.repository.interface';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { PasswordRecoveryMapper } from './mappers/password-recovery.mapper';

@Injectable()
export class PasswordRecoveryRepositoryImplementation implements IPasswordRecoveryRepository {
  constructor(private readonly prismaService: PrismaService) {}

  public async save(recovery: PasswordRecoveryEntity): Promise<void> {
    await this.prismaService.passwordRecovery.create({
      data: this.toCreateData(recovery),
    });
  }

  public async findByCode(recoveryCode: string): Promise<PasswordRecoveryEntity | null> {
    const recovery = await this.prismaService.passwordRecovery.findFirst({
      where: {
        recoveryCode,
        deletedAt: null,
      },
    });

    return recovery ? PasswordRecoveryMapper.toDomain(recovery) : null;
  }

  public async deleteByUserId(userId: string): Promise<void> {
    const deletedRows = await this.prismaService.passwordRecovery.deleteMany({
      where: {
        userId,
      },
    });

    if (deletedRows.count === 0) {
      throw this.createNotFoundException(userId);
    }
  }

  public async update(recovery: PasswordRecoveryEntity): Promise<void> {
    const affectedRows = await this.prismaService.passwordRecovery.updateMany({
      where: {
        id: this.requireEntityId(recovery),
        deletedAt: null,
      },
      data: this.toUpdateData(recovery),
    });

    if (affectedRows.count === 0) {
      throw this.createNotFoundException(recovery.userId);
    }
  }

  private toCreateData(recovery: PasswordRecoveryEntity): {
    id: string;
    userId: string;
    recoveryCode: string;
    expirationDate: Date;
    isUsed: boolean;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
  } {
    return {
      id: this.requireEntityId(recovery),
      userId: recovery.userId,
      recoveryCode: recovery.recoveryCode,
      expirationDate: recovery.expirationDate,
      isUsed: recovery.isUsed,
      createdAt: recovery.createdAt,
      updatedAt: recovery.updatedAt,
      deletedAt: recovery.deletedAt,
    };
  }

  private toUpdateData(recovery: PasswordRecoveryEntity): {
    userId: string;
    recoveryCode: string;
    expirationDate: Date;
    isUsed: boolean;
    updatedAt: Date;
    deletedAt: Date | null;
  } {
    return {
      userId: recovery.userId,
      recoveryCode: recovery.recoveryCode,
      expirationDate: recovery.expirationDate,
      isUsed: recovery.isUsed,
      updatedAt: recovery.updatedAt,
      deletedAt: recovery.deletedAt,
    };
  }

  private requireEntityId(recovery: PasswordRecoveryEntity): string {
    if (recovery.id) {
      return recovery.id;
    }

    throw this.createNotFoundException(recovery.userId);
  }

  private createNotFoundException(userId: string): DomainException {
    return new DomainException({
      code: DomainExceptionCode.NotFound,
      message: `Password recovery for user ${userId} was not found`,
    });
  }
}
