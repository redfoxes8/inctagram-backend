import { DomainExceptionCode } from './domain-exception-codes';

export type Extension = {
  message: string;
  field: string;
};

export class DomainException extends Error {
  readonly code: DomainExceptionCode;

  readonly extensions: Extension[];

  constructor(errorInfo: { code: DomainExceptionCode; message: string; extensions?: Extension[] }) {
    super(errorInfo.message);
    Object.setPrototypeOf(this, new.target.prototype);

    this.name = DomainException.name;
    this.code = errorInfo.code;
    this.extensions = errorInfo.extensions ?? [];
  }
}
