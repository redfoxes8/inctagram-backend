import { Injectable } from '@nestjs/common';
import { EmailConfirmationEntity } from '../domain/email-confirmation.entity';
import { IEmailConfirmationRepository } from '../domain/interfaces/email-confirmation.repository.interface';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { EmailConfirmationMapper } from './mappers/email-confirmation.mapper';
import { PrismaService } from '../../../core/prisma/prisma.service';

@Injectable()
export class EmailConfirmationRepositoryImplementation implements IEmailConfirmationRepository {
  constructor(private readonly prismaService: PrismaService) {}

  public async save(confirmation: EmailConfirmationEntity): Promise<void> {
    await this.prismaService.emailConfirmation.create({
      data: this.toCreateData(confirmation),
    });
  }

  public async findByUserId(userId: string): Promise<EmailConfirmationEntity | null> {
    const confirmation = await this.prismaService.emailConfirmation.findFirst({
      where: {
        userId,
        deletedAt: null,
      },
    });

    return confirmation ? EmailConfirmationMapper.toDomain(confirmation) : null;
  }

  public async deleteByUserId(userId: string): Promise<void> {
    const deletedRows = await this.prismaService.emailConfirmation.deleteMany({
      where: {
        userId,
      },
    });

    if (deletedRows.count === 0) {
      throw this.createNotFoundException(userId);
    }
  }

  public async update(confirmation: EmailConfirmationEntity): Promise<void> {
    const affectedRows = await this.prismaService.emailConfirmation.updateMany({
      where: {
        id: this.requireEntityId(confirmation),
        deletedAt: null,
      },
      data: this.toUpdateData(confirmation),
    });

    if (affectedRows.count === 0) {
      throw this.createNotFoundException(confirmation.userId);
    }
  }

  public async findByCode(confirmationCode: string): Promise<EmailConfirmationEntity | null> {
    const confirmation = await this.prismaService.emailConfirmation.findFirst({
      where: {
        confirmationCode,
        deletedAt: null,
      },
    });

    return confirmation ? EmailConfirmationMapper.toDomain(confirmation) : null;
  }

  private toCreateData(confirmation: EmailConfirmationEntity): {
    id: string;
    userId: string;
    confirmationCode: string;
    expirationDate: Date;
    isConfirmed: boolean;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
  } {
    return {
      id: this.requireEntityId(confirmation),
      userId: confirmation.userId,
      confirmationCode: confirmation.confirmationCode,
      expirationDate: confirmation.expirationDate,
      isConfirmed: confirmation.isConfirmed,
      createdAt: confirmation.createdAt,
      updatedAt: confirmation.updatedAt,
      deletedAt: confirmation.deletedAt,
    };
  }

  private toUpdateData(confirmation: EmailConfirmationEntity): {
    userId: string;
    confirmationCode: string;
    expirationDate: Date;
    isConfirmed: boolean;
    updatedAt: Date;
    deletedAt: Date | null;
  } {
    return {
      userId: confirmation.userId,
      confirmationCode: confirmation.confirmationCode,
      expirationDate: confirmation.expirationDate,
      isConfirmed: confirmation.isConfirmed,
      updatedAt: confirmation.updatedAt,
      deletedAt: confirmation.deletedAt,
    };
  }

  private requireEntityId(confirmation: EmailConfirmationEntity): string {
    if (confirmation.id) {
      return confirmation.id;
    }

    throw this.createNotFoundException(confirmation.userId);
  }

  private createNotFoundException(userId: string): DomainException {
    return new DomainException({
      code: DomainExceptionCode.NotFound,
      message: `Email confirmation for user ${userId} was not found`,
    });
  }
}
