import { GraphQLError, GraphQLScalarType, Kind } from 'graphql';

function parseDateTime(value: unknown): string {
  if (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
  ) {
    const date = new Date(value);
    if (
      Number.isFinite(date.getTime()) &&
      date.toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z')
    ) {
      return date.toISOString();
    }
  }
  throw new GraphQLError('Invalid DateTime', { extensions: { code: 'BAD_USER_INPUT' } });
}

export const dateTimeScalar = new GraphQLScalarType({
  name: 'DateTime',
  description: 'ISO-8601 UTC timestamp',
  serialize: parseDateTime,
  parseValue: parseDateTime,
  parseLiteral(node): string {
    return parseDateTime(node.kind === Kind.STRING ? node.value : null);
  },
});
