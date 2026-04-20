import {
  ValidationPipeOptions,
} from '@nestjs/common';
import { ValidationError } from 'class-validator';

import { DomainException } from '../exceptions/domain-exception';
import { DomainExceptionCode } from '../exceptions/domain-exception-codes';
import { formatValidationErrors } from './validation-error.formatter';

export const BASE_VALIDATION_PIPE_OPTIONS: ValidationPipeOptions = {
  transform: true,
  whitelist: true,
  stopAtFirstError: true,
  exceptionFactory: (errors: ValidationError[]): never => {
    throw new DomainException({
      code: DomainExceptionCode.ValidationError,
      message: 'Validation failed',
      extensions: formatValidationErrors(errors),
    });
  },
};

export function createValidationPipeOptions(
  customOptions: ValidationPipeOptions = {},
): ValidationPipeOptions {
  return {
    ...BASE_VALIDATION_PIPE_OPTIONS,
    ...customOptions,
    exceptionFactory:
      customOptions.exceptionFactory ?? BASE_VALIDATION_PIPE_OPTIONS.exceptionFactory,
  };
}
