import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { SuperadminHttpContext } from './superadmin-context';
import { SuperadminSessionException } from './superadmin.guard';
import { SuperadminLoginInput } from './superadmin-login.input';
import { AdminSessionCookies } from './admin-session-cookies';
import { SuperadminLoginUseCase } from '../application/superadmin-login.usecase';
import { SuperadminLogoutUseCase } from '../application/superadmin-logout.usecase';
import { readAdminToken } from '../application/admin-token';

@Resolver()
export class SuperadminAuthResolver {
  constructor(
    private readonly login: SuperadminLoginUseCase,
    private readonly logout: SuperadminLogoutUseCase,
    private readonly cookies: AdminSessionCookies,
  ) {}

  @Query('superadminSession')
  session(@Context() context: SuperadminHttpContext): { authenticated: boolean } {
    this.cookies.bootstrapCsrf(context.res);
    return { authenticated: true };
  }

  @SuperadminSessionException('login')
  @Mutation('superadminLogin')
  async signIn(
    @Args('input') input: SuperadminLoginInput,
    @Context() context: SuperadminHttpContext,
  ): Promise<{ authenticated: boolean }> {
    const result = await this.login.execute({
      ...input,
      // No trust-proxy override: the peer address cannot be spoofed with X-Forwarded-For.
      ip: context.req.socket.remoteAddress ?? 'unknown',
      previousToken: readAdminToken(context.req.cookies?.superadminSession),
    });
    this.cookies.setSession({ response: context.res, ...result });
    this.cookies.bootstrapCsrf(context.res);
    return { authenticated: true };
  }

  @SuperadminSessionException('logout')
  @Mutation('superadminLogout')
  async signOut(@Context() context: SuperadminHttpContext): Promise<{ loggedOut: boolean }> {
    await this.logout.execute({ token: readAdminToken(context.req.cookies?.superadminSession) });
    this.cookies.clear(context.res);
    context.principal = null;
    return { loggedOut: true };
  }
}
