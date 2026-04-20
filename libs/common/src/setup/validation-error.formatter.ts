import { ValidationError } from 'class-validator';

import { Extension } from '../exceptions/domain-exception';

export function formatValidationErrors(
  errors: ValidationError[],
  collectedErrors: Extension[] = [],
): Extension[] {
  for (const error of errors) {
    if (error.children?.length && !error.constraints) {
      formatValidationErrors(error.children, collectedErrors);
      continue;
    }

    if (!error.constraints) {
      continue;
    }

    const constraintMessages = Object.values(error.constraints);

    for (const constraintMessage of constraintMessages) {
      collectedErrors.push({
        field: error.property,
        message: constraintMessage,
      });
    }
  }

  return collectedErrors;
}
