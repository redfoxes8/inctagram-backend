import {
  getOperationAST,
  getVariableValues,
  GraphQLError,
  Kind,
  OperationTypeNode,
  NoSchemaIntrospectionCustomRule,
  parse,
  specifiedRules,
  validate,
  type ExecutionArgs,
  type DocumentNode,
  type GraphQLSchema,
  type SelectionSetNode,
} from 'graphql';
import type { SubscribePayload } from 'graphql-ws';
import type { SuperadminWsContext } from './superadmin-context';
import { assertSuperadminBudget } from './superadmin-query-budget';

export function superadminWsError(code: string): GraphQLError {
  return new GraphQLError('Request rejected', { extensions: { code } });
}

export function prepareSuperadminSubscription(input: {
  schema: GraphQLSchema;
  payload: SubscribePayload;
  context: SuperadminWsContext;
  fields: readonly string[];
  production: boolean;
}): ExecutionArgs {
  let document: DocumentNode;
  try {
    document = parse(input.payload.query);
  } catch {
    throw superadminWsError('GRAPHQL_PARSE_FAILED');
  }
  const errors = validate(
    input.schema,
    document,
    input.production ? [...specifiedRules, NoSchemaIntrospectionCustomRule] : specifiedRules,
  );
  if (errors.length) throw superadminWsError('GRAPHQL_VALIDATION_FAILED');
  const operation = getOperationAST(document, input.payload.operationName);
  if (!operation) throw superadminWsError('GRAPHQL_VALIDATION_FAILED');
  if (operation.operation !== OperationTypeNode.SUBSCRIPTION) throw superadminWsError('FORBIDDEN');
  const checkedFragments = new Set<string>();
  const checkFields = (selection: SelectionSetNode): void => {
    for (const field of selection.selections) {
      if (field.kind === Kind.FIELD) {
        if (!input.fields.includes(field.name.value)) throw superadminWsError('FORBIDDEN');
      } else if (field.kind === Kind.INLINE_FRAGMENT) checkFields(field.selectionSet);
      else {
        if (checkedFragments.has(field.name.value)) continue;
        checkedFragments.add(field.name.value);
        const fragment = document.definitions.find(
          (entry) =>
            entry.kind === Kind.FRAGMENT_DEFINITION && entry.name.value === field.name.value,
        );
        if (fragment?.kind === Kind.FRAGMENT_DEFINITION) checkFields(fragment.selectionSet);
      }
    }
  };
  checkFields(operation.selectionSet);
  const variables = getVariableValues(
    input.schema,
    operation.variableDefinitions ?? [],
    input.payload.variables ?? {},
  );
  if (variables.errors) throw superadminWsError('BAD_USER_INPUT');
  assertSuperadminBudget({ document, variables: variables.coerced, allowSubscriptions: true });
  return {
    schema: input.schema,
    document,
    variableValues: variables.coerced,
    operationName: input.payload.operationName,
    contextValue: input.context,
  };
}
