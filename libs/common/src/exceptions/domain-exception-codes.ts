export enum DomainExceptionCode {
  BadRequest = 400,
  Unauthorized = 401,
  Forbidden = 403,
  NotFound = 404,
  TooManyRequests = 429,
  InternalServerError = 500,
  EmailNotConfirmed = 401,
  ConfirmationCodeExpired = 401,
  PasswordRecoveryCodeExpired = 401,
  ValidationError = 400,
}
