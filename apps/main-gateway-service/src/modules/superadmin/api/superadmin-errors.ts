import { GraphQLError, type GraphQLFormattedError } from 'graphql';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';

const DOMAIN_CODES: Readonly<Record<number, string>> = {
  400: 'BAD_USER_INPUT',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'TOO_MANY_REQUESTS',
  503: 'UPSTREAM_UNAVAILABLE',
  504: 'UPSTREAM_UNAVAILABLE',
};
const MESSAGES: Readonly<Record<string, string>> = {
  UNAUTHENTICATED: 'Authentication required',
  FORBIDDEN: 'Access denied',
  BAD_USER_INPUT: 'Invalid input',
  NOT_FOUND: 'Not found',
  CONFLICT: 'Conflict',
  TOO_MANY_REQUESTS: 'Too many requests',
  UPSTREAM_UNAVAILABLE: 'Service unavailable',
  INTERNAL_SERVER_ERROR: 'Internal server error',
  GRAPHQL_VALIDATION_FAILED: 'Invalid GraphQL operation',
  GRAPHQL_PARSE_FAILED: 'Invalid GraphQL syntax',
};

export function formatSuperadminError(input: {
  formatted: GraphQLFormattedError;
  error: unknown;
}): GraphQLFormattedError {
  const original = input.error instanceof GraphQLError ? input.error.originalError : input.error;
  const candidate =
    original instanceof DomainException
      ? DOMAIN_CODES[original.code]
      : input.formatted.extensions?.code;
  const code =
    typeof candidate === 'string' && Object.hasOwn(MESSAGES, candidate)
      ? candidate
      : 'INTERNAL_SERVER_ERROR';
  return { message: MESSAGES[code], path: input.formatted.path, extensions: { code } };
}
