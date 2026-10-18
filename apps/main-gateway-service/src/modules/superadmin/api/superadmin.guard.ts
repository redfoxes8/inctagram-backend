import { CanActivate, ExecutionContext, Injectable, Optional, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { GraphQLError, OperationTypeNode, type GraphQLResolveInfo } from 'graphql';
import { AdminPrincipalVerifier } from '../domain/admin-principal';
import type { AdminPrincipal } from '../domain/admin-principal';
import type { SuperadminContext } from './superadmin-context';
import { assertSuperadminCsrf } from './superadmin-http-security';

const SESSION_EXCEPTION = 'superadmin:session-exception';
export const SuperadminSessionException = (operation: 'login' | 'logout'): MethodDecorator =>
  SetMetadata(SESSION_EXCEPTION, operation);

@Injectable()
export class SuperadminGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Optional() private readonly verifier?: AdminPrincipalVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType<string>() !== 'graphql') return true;
    const graphql = GqlExecutionContext.create(context);
    const info = graphql.getInfo<GraphQLResolveInfo>();
    const exception = this.reflector.get<'login' | 'logout'>(
      SESSION_EXCEPTION,
      context.getHandler(),
    );
    const requestContext = graphql.getContext<SuperadminContext>();
    if (
      info.parentType.name === 'Mutation' &&
      exception === 'login' &&
      info.fieldName === 'superadminLogin'
    )
      return true;
    const token: unknown = requestContext.req.cookies?.superadminSession;
    requestContext.principal = null;
    let principal: AdminPrincipal | null = null;
    try {
      principal =
        (await this.verifier?.verify({
          sessionToken: typeof token === 'string' ? token : null,
        })) ?? null;
    } catch {
      requestContext.principal = null;
      throw new GraphQLError('Service unavailable', {
        extensions: { code: 'UPSTREAM_UNAVAILABLE' },
      });
    }
    if (
      typeof token === 'string' &&
      token.length > 0 &&
      principal?.role === 'SUPERADMIN' &&
      typeof principal.sessionId === 'string' &&
      principal.sessionId.length > 0
    ) {
      if (info.operation.operation === OperationTypeNode.MUTATION) this.checkCsrf(requestContext);
      requestContext.principal = principal;
      return true;
    }
    if (
      exception === 'logout' &&
      info.parentType.name === 'Mutation' &&
      info.fieldName === 'superadminLogout'
    )
      return true;
    throw new GraphQLError('Authentication required', { extensions: { code: 'UNAUTHENTICATED' } });
  }

  private checkCsrf(context: SuperadminContext): void {
    try {
      assertSuperadminCsrf(context.req);
    } catch {
      throw new GraphQLError('Access denied', { extensions: { code: 'FORBIDDEN' } });
    }
  }
}
