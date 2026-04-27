import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import {
  IOAuthAccountsRepository,
  OAuthAccountData,
} from '../../domain/interfaces/oauth-accounts.repository.interface';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaOAuthAccountsRepository implements IOAuthAccountsRepository {
  constructor(private readonly prismaService: PrismaService) {}

  public async findByProviderId(
    provider: string,
    providerId: string,
  ): Promise<OAuthAccountData | null> {
    const account = await this.prismaService.oAuthAccount.findFirst({
      where: {
        provider,
        providerId,
      },
    });

    if (!account) {
      return null;
    }

    return {
      userId: account.userId,
      provider: account.provider,
      providerId: account.providerId,
    };
  }

  public async create(data: OAuthAccountData, tx?: PrismaClient): Promise<void> {
    const prisma = tx || this.prismaService;

    await prisma.oAuthAccount.create({
      data: {
        userId: data.userId,
        provider: data.provider,
        providerId: data.providerId,
      },
    });
  }
}
