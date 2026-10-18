import { DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled';
import { AdminPrincipalVerifier } from './domain/admin-principal';
import { DenyAdminPrincipalVerifier } from './infrastructure/deny-admin-principal.verifier';
import { SuperadminGuard } from './api/superadmin.guard';
import { createSuperadminContext } from './api/superadmin-context';
import { formatSuperadminError } from './api/superadmin-errors';
import { superadminBudgetPlugin, superadminBudgetRule } from './api/superadmin-query-budget';
import { dateTimeScalar } from '../../../../../libs/common/src/graphql/date-time.scalar';
import { SuperadminExceptionFilter } from './api/superadmin-exception.filter';

@Module({
  providers: [
    { provide: AdminPrincipalVerifier, useClass: DenyAdminPrincipalVerifier },
    { provide: APP_GUARD, useClass: SuperadminGuard },
    { provide: APP_FILTER, useClass: SuperadminExceptionFilter },
  ],
  exports: [AdminPrincipalVerifier],
})
export class SuperadminModule {
  // SA-GQL-02 supplies implemented SDL fragments, resolvers and verifier binding.
  // Import SuperadminModule (without this method) while no business Query root exists.
  static withRuntime(input: { typeDefs: string; production: boolean }): DynamicModule {
    return {
      module: SuperadminModule,
      imports: [
        GraphQLModule.forRoot<ApolloDriverConfig>({
          driver: ApolloDriver,
          typeDefs: input.typeDefs,
          path: '/graphql',
          useGlobalPrefix: true,
          fieldResolverEnhancers: ['guards', 'filters'],
          context: createSuperadminContext,
          resolvers: { DateTime: dateTimeScalar },
          introspection: !input.production,
          playground: false,
          allowBatchedHttpRequests: false,
          includeStacktraceInErrorResponses: false,
          csrfPrevention: true,
          validationRules: [superadminBudgetRule],
          plugins: [ApolloServerPluginLandingPageDisabled(), superadminBudgetPlugin],
          formatError: (formatted, error) => formatSuperadminError({ formatted, error }),
        }),
      ],
    };
  }
}
