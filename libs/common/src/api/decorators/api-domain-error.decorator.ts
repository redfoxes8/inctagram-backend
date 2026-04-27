import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

export function ApiDomainError(
  statusCode: HttpStatus,
  description: string,
  message: string = 'Error',
  errorsMessages?: { message: string; field: string }[],
) {
  return applyDecorators(
    ApiResponse({
      status: statusCode,
      description: description,
      content: {
        'application/json': {
          example: {
            statusCode: statusCode,
            message: message,
            ...(errorsMessages && { errorsMessages }),
          },
        },
      },
    }),
  );
}
