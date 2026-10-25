import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';
import { IsUUID } from 'class-validator';
import { ModerateUserUseCase } from '../../users/application/commands/moderate-user.usecase';
import type { UserModerationResult } from '../../users/domain/interfaces/user-moderation.repository';
import type { SuperadminContext } from './superadmin-context';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';

export class SuperadminUserIdInput {
  @IsUUID() userId: string;
}

@Resolver()
export class SuperadminModerationResolver {
  constructor(private readonly moderation: ModerateUserUseCase) {}

  @Mutation('superadminBlockUser')
  block(
    @Args('input') input: SuperadminUserIdInput,
    @Context() context: SuperadminContext,
    // SDL coerces the nested shape; the use case applies S2 normalization, including legacy null.
    @Args('reason') reason: unknown,
  ): Promise<{ userId: string } & UserModerationResult> {
    return this.moderation.execute({
      ...input,
      action: 'BLOCK',
      reason,
      adminSessionId: this.sessionId(context),
    });
  }

  @Mutation('superadminUnblockUser')
  unblock(
    @Args('input') input: SuperadminUserIdInput,
    @Context() context: SuperadminContext,
  ): Promise<{ userId: string } & UserModerationResult> {
    return this.moderation.execute({
      ...input,
      action: 'UNBLOCK',
      adminSessionId: this.sessionId(context),
    });
  }

  private sessionId(context: SuperadminContext): string {
    if (context.principal) return context.principal.sessionId;
    throw new DomainException({ code: DomainExceptionCode.Unauthorized, message: 'Unauthorized' });
  }

  @Mutation('superadminDeleteUser')
  deleteUser(
    @Args('input') input: SuperadminUserIdInput,
    @Context() context: SuperadminContext,
  ): Promise<{ userId: string } & UserModerationResult> {
    return this.moderation.execute({
      ...input,
      action: 'DELETE',
      adminSessionId: this.sessionId(context),
    });
  }
}
