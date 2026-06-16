export enum DomainExceptionCode {
  BadRequest = 400,
  Unauthorized = 401,
  Forbidden = 403,
  NotFound = 404,
  TooManyRequests = 429,
  InternalServerError = 500,
  ServiceUnavailable = 503,
  GatewayTimeout = 504,
  Conflict = 409,
}
