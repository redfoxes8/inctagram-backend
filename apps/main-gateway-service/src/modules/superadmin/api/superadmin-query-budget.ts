import {
  GraphQLError,
  Kind,
  OperationTypeNode,
  getVariableValues,
  valueFromASTUntyped,
  type DocumentNode,
  type FragmentDefinitionNode,
  type SelectionSetNode,
  type ValidationRule,
} from 'graphql';
import type { ApolloServerPlugin, BaseContext, GraphQLRequestListener } from '@apollo/server';
import { SUPERADMIN_PAYMENTS_PAGE_SIZE } from '../../../../../../libs/common/types/superadmin-payments-list';

export const SUPERADMIN_MAX_DEPTH = 8;
export const SUPERADMIN_MAX_COMPLEXITY = 200;

// Expand every fragment use/alias separately; cap work before recursively expanding further.
export function assertSuperadminBudget(input: {
  document: DocumentNode;
  variables?: Record<string, unknown>;
  includePagination?: boolean;
}): void {
  const fragments = new Map<string, FragmentDefinitionNode>();
  for (const definition of input.document.definitions) {
    if (definition.kind === Kind.FRAGMENT_DEFINITION)
      fragments.set(definition.name.value, definition);
  }
  let complexity = 0;
  const visitSelections = (options: {
    selection: SelectionSetNode;
    depth: number;
    multiplier: number;
    pageSize: number;
    trail: string[];
  }): void => {
    if (options.depth > SUPERADMIN_MAX_DEPTH) throw budgetError();
    for (const selection of options.selection.selections) {
      if (selection.kind === Kind.FIELD) {
        complexity += options.multiplier;
        if (complexity > SUPERADMIN_MAX_COMPLEXITY) throw budgetError();
        if (selection.selectionSet) {
          // Connection items multiply by this operation's page size. Unspecified is the contract default.
          const argument = selection.arguments?.find((entry) => entry.name.value === 'input');
          const value: unknown = argument
            ? valueFromASTUntyped(argument.value, input.variables)
            : null;
          let requestedSize =
            typeof value === 'object' && value !== null && 'pageSize' in value
              ? value.pageSize
              : options.pageSize;
          if (selection.name.value === 'superadminPayments')
            requestedSize = SUPERADMIN_PAYMENTS_PAGE_SIZE;
          const pageSize =
            typeof requestedSize === 'number' &&
            Number.isInteger(requestedSize) &&
            requestedSize >= 1 &&
            requestedSize <= 50
              ? requestedSize
              : 8;
          const multiplier =
            selection.name.value === 'items' && input.includePagination !== false
              ? options.multiplier * pageSize
              : options.multiplier;
          visitSelections({
            selection: selection.selectionSet,
            depth: options.depth + 1,
            multiplier,
            pageSize,
            trail: options.trail,
          });
        }
      } else if (selection.kind === Kind.INLINE_FRAGMENT) {
        visitSelections({ ...options, selection: selection.selectionSet });
      } else {
        if (options.trail.includes(selection.name.value)) throw budgetError();
        const fragment = fragments.get(selection.name.value);
        if (fragment)
          visitSelections({
            ...options,
            selection: fragment.selectionSet,
            trail: [...options.trail, selection.name.value],
          });
      }
    }
  };
  for (const definition of input.document.definitions) {
    if (definition.kind === Kind.OPERATION_DEFINITION) {
      if (definition.operation === OperationTypeNode.SUBSCRIPTION) throw budgetError();
      visitSelections({
        selection: definition.selectionSet,
        depth: 1,
        multiplier: 1,
        pageSize: 8,
        trail: [],
      });
    }
  }
}

function budgetError(): GraphQLError {
  return new GraphQLError('Query budget exceeded', { extensions: { code: 'BAD_USER_INPUT' } });
}

export const superadminBudgetRule: ValidationRule = (context) => ({
  Document(document): void {
    try {
      assertSuperadminBudget({ document, includePagination: false });
    } catch {
      context.reportError(budgetError());
    }
  },
});

export const superadminBudgetPlugin: ApolloServerPlugin = {
  requestDidStart(): Promise<GraphQLRequestListener<BaseContext>> {
    const listener: GraphQLRequestListener<BaseContext> = {
      didResolveOperation(context): Promise<void> {
        if (!context.operation) throw budgetError();
        const variables = getVariableValues(
          context.schema,
          context.operation.variableDefinitions ?? [],
          context.request.variables ?? {},
        );
        if (variables.errors) {
          throw new GraphQLError('Invalid input', { extensions: { code: 'BAD_USER_INPUT' } });
        }
        assertSuperadminBudget({
          document: context.document,
          variables: variables.coerced,
        });
        return Promise.resolve();
      },
    };
    return Promise.resolve(listener);
  },
};
