import { ArgumentsHost, Catch } from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { GraphQLError } from 'graphql';
import { formatSuperadminError } from './superadmin-errors';

@Catch()
export class SuperadminExceptionFilter extends BaseExceptionFilter {
  constructor(adapterHost: HttpAdapterHost) {
    super(adapterHost.httpAdapter);
  }

  catch(exception: unknown, host: ArgumentsHost): unknown {
    if (host.getType<string>() === 'graphql') {
      const wrapped =
        exception instanceof GraphQLError
          ? exception
          : new GraphQLError('Internal server error', {
              originalError: exception instanceof Error ? exception : undefined,
            });
      const safe = formatSuperadminError({ formatted: wrapped.toJSON(), error: wrapped });
      return new GraphQLError(safe.message, { extensions: safe.extensions });
    }
    // Preserve Nest's existing non-GraphQL exception handling and HTTP response format.
    return super.catch(exception, host);
  }
}
