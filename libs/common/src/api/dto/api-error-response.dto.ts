import { ApiProperty } from '@nestjs/swagger';

export class FieldErrorDto {
  @ApiProperty({ description: 'Field that caused the error', example: 'email' })
  field: string;

  @ApiProperty({ description: 'Error message for the field', example: 'Email is already taken' })
  message: string;
}

export class ApiErrorResponseDto {
  @ApiProperty({ description: 'HTTP status code', example: 400 })
  statusCode: number;

  @ApiProperty({ description: 'High-level error message', example: 'Validation failed' })
  message: string;

  @ApiProperty({
    description: 'Detailed field errors',
    type: [FieldErrorDto],
    required: false,
  })
  errorsMessages?: FieldErrorDto[];
}
